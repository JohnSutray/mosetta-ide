import { activate, configSection, plugin, remote, stub } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { computed, effect, type ReadonlySignal } from '@preact/signals';
import { LSP_DEFAULTS , LSP_SCHEMA} from './settings.js';
import { Lsp } from './state.js';
import { ServerBadge } from './icons.js';
import type { RevealLike } from './types.js';

export { LSP_DEFAULTS, type LspServerSettings, type LspSettings } from './settings.js';
import type {
  CompletionAnswer,
  CompletionDetails,
  Diagnostic,
  FileDiagnostics,
  HoverInfo,
  LspStatus,
  SymbolSite,
} from './types.js';
import DocPlugin from '@mosetta/ide-plugin-doc';

export type {
  CompletionAnswer,
  CompletionDetails,
  CompletionEntry,
  CompletionKind,
  Diagnostic,
  FileDiagnostics,
  HoverInfo,
  LspState,
  LspStatus,
  LspSweep,
  Position,
  Range,
  RevealLike,
  Severity,
  SweepStop,
  SymbolSite,
  TextEdit,
} from './types.js';

/**
 * Language servers are a plugin. The client half holds what the server said
 * (diagnostics, statuses) and answers the neighbours' questions: the editor about the
 * open file and the hover tooltip, the tree and the problems panel about the whole
 * project, symbols about where something is declared and where it is used.
 *
 * Neighbours take that through `getPlugin(LspPlugin)` rather than from the contract:
 * not one name about the language server is left in the contract.
 */
@configSection({ section: 'lsp', defaults: LSP_DEFAULTS, schema: LSP_SCHEMA })
@plugin({ title: 'plugin.lsp' })
export default class LspPlugin {
  /** Documents are a neighbour: what is open, where to jump, how to edit. */
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  readonly lsp = new Lsp();

  /** The whole project's errors, by file, alphabetically. */
  readonly problems: ReadonlySignal<FileDiagnostics[]> = this.lsp.problems;
  readonly statuses = this.lsp.statuses;
  /** What was said about the OPEN file. */
  readonly fileDiagnostics: ReadonlySignal<Diagnostic[]> = computed(() =>
    this.lsp.of(this.docs.openDoc.value?.path ?? null),
  );

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.registry('toolbar.widget').add({
      id: 'lsp-sweep',
      side: 'right',
      chip: () => this.sweepChips(),
    });

    this.ide.on('diagnostics', (payload) => {
      const event = payload as FileDiagnostics;
      this.lsp.set(event.path, event.diagnostics);
    });
    this.ide.on('status', (payload) => this.lsp.setStatus(payload as LspStatus));

    effect(() => {
      this.ide.workspaces.current.value;
      this.lsp.reset();
    });

    effect(() => {
      if (!this.ide.project.value) return;
      void this.askStatus()
        .then((list) => {
          for (const status of list) this.lsp.setStatus(status);
        })
        .catch(() => undefined);
      void this.askProblems()
        .then((files) => {
          for (const file of files) this.lsp.set(file.path, file.diagnostics);
        })
        .catch(() => undefined);
    });

    effect(() => {
      const path = this.docs.openDoc.value?.path;
      if (!path || !this.ide.project.value) return;
      void this.askDiagnostics({ path })
        .then((known) => this.lsp.set(known.path, known.diagnostics))
        .catch(() => undefined);
    });
  }

  /**
   * Lead to the budget setting. Through the registry rather than through `getPlugin`:
   * an import would make the settings window mandatory for the language server, which
   * is untrue — the settings can be turned off while the server works.
   */
  private revealBudget(): void {
    this.ide.registry<RevealLike>('settings.reveal').all.value[0]?.reveal('memoryBudgetMb');
  }

  /**
   * Who will lead to the row with the server's command — the one that did not start. By
   * the same registry key as the budget: the settings can be turned off while the
   * language server works.
   */
  private revealServers(): void {
    this.ide.registry<RevealLike>('settings.reveal').all.value[0]?.reveal('servers');
  }

  private sweepChips() {
    if (!this.ide.settingsOf('lsp', LSP_DEFAULTS).value.sweepIndicator) return null;
    const shown = this.statuses.value.filter((one) => one.sweep);
    const broken = this.statuses.value.filter((one) => one.state === 'failed');
    if (shown.length === 0 && broken.length === 0) return null;

    return [
      ...broken.map((status) => ({
        id: `down:${status.server}`,
        icon: <ServerBadge server={status.server} />,
        text: this.ide.t('lsp.down.files'),
        tip: this.ide.t('lsp.down.about', { server: status.server, why: status.detail ?? '' }),
        tone: 'bad' as const,
        onClick: () => this.revealServers(),
      })),
      ...shown.map((status) => {
        const sweep = status.sweep!;
        const over = sweep.mb !== null && sweep.mb > sweep.budgetMb;
        const capped = over || sweep.stopped === 'budget' || sweep.stopped === 'baseline';
        return {
          id: status.server,
          icon: <ServerBadge server={status.server} />,
          text: this.ide.t('lsp.sweep.files', { checked: sweep.checked, total: sweep.total }),
          ...(sweep.mb === null
            ? {}
            : { more: this.ide.t('lsp.sweep.memory', { mb: sweep.mb, budget: sweep.budgetMb }) }),
          tip: this.ide.t('lsp.sweep.about', {
            server: status.server,
            checked: sweep.checked,
            total: sweep.total,
          }),
          ...(capped ? { tone: 'warn' as const } : {}),
          busy: sweep.stopped === null,
          onClick: () => this.revealBudget(),
        };
      }),
    ];
  }

  /** The hover tooltip. */
  hover(path: string, line: number, character: number): Promise<HoverInfo | null> {
    return this.askHover({ path, line, character });
  }

  /** Where a symbol is declared and where it is used. */
  definition(path: string, line: number, character: number): Promise<SymbolSite[]> {
    return this.askDefinition({ path, line, character });
  }

  references(path: string, line: number, character: number): Promise<SymbolSite[]> {
    return this.askReferences({ path, line, character });
  }

  /**
   * Whether any enabled server looks after this file. Asked by completion: buffer words
   * after a dot are needed only where nobody will name the type's members.
   */
  serves(path: string): boolean {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    if (dot <= 0) return false;
    const extension = name.slice(dot + 1).toLowerCase();
    const servers = this.ide.settingsOf('lsp', LSP_DEFAULTS).value.servers;
    return Object.values(servers).some((server) => server.enabled && server.extensions.includes(extension));
  }

  /** What can be inserted at this place. */
  complete(path: string, line: number, character: number, trigger?: string): Promise<CompletionAnswer> {
    return this.askCompletion({ path, line, character, ...(trigger ? { trigger } : {}) });
  }

  /** Read an item in: the documentation and the import line. */
  resolveCompletion(path: string, item: unknown): Promise<CompletionDetails> {
    return this.askResolve({ path, item });
  }

  @remote('completion') protected askCompletion(_params: {
    path: string;
    line: number;
    character: number;
    trigger?: string;
  }): Promise<CompletionAnswer> {
    return stub();
  }

  @remote('resolve') protected askResolve(_params: { path: string; item: unknown }): Promise<CompletionDetails> {
    return stub();
  }

  @remote('status') protected askStatus(): Promise<LspStatus[]> {
    return stub();
  }

  @remote('problems') protected askProblems(): Promise<FileDiagnostics[]> {
    return stub();
  }

  @remote('diagnostics') protected askDiagnostics(_params: { path: string }): Promise<FileDiagnostics> {
    return stub();
  }

  @remote('hover') protected askHover(_params: {
    path: string;
    line: number;
    character: number;
  }): Promise<HoverInfo | null> {
    return stub();
  }

  @remote('definition') protected askDefinition(_params: {
    path: string;
    line: number;
    character: number;
  }): Promise<SymbolSite[]> {
    return stub();
  }

  @remote('references') protected askReferences(_params: {
    path: string;
    line: number;
    character: number;
  }): Promise<SymbolSite[]> {
    return stub();
  }
}
