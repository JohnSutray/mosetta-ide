import { activate, configSection, plugin, remote, stub } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { computed, effect, type ReadonlySignal } from '@preact/signals';
import { LSP_DEFAULTS , LSP_SCHEMA} from './settings.js';
import { Lsp } from './state.js';
import { STYLE } from './style.js';
import { ServerBadge } from './icons.js';
import type { RevealLike, TipsLike } from './types.js';

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

@configSection({ section: 'lsp', defaults: LSP_DEFAULTS, schema: LSP_SCHEMA })
@plugin({ title: 'plugin.lsp' })
export default class LspPlugin {
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  readonly lsp = new Lsp();

  readonly problems: ReadonlySignal<FileDiagnostics[]> = this.lsp.problems;
  readonly statuses = this.lsp.statuses;
  readonly fileDiagnostics: ReadonlySignal<Diagnostic[]> = computed(() =>
    this.lsp.of(this.docs.openDoc.value?.path ?? null),
  );

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry('toolbar.widget').add({
      id: 'lsp-sweep',
      side: 'right',
      view: () => this.sweepLabel(),
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

  private get tips(): TipsLike | null {
    return this.ide.registry<TipsLike>('ui.tips').all.value[0] ?? null;
  }

  private revealBudget(): void {
    this.ide.registry<RevealLike>('settings.reveal').all.value[0]?.reveal('memoryBudgetMb');
  }

  private revealServers(): void {
    this.ide.registry<RevealLike>('settings.reveal').all.value[0]?.reveal('servers');
  }

  private sweepLabel() {
    if (!this.ide.settingsOf('lsp', LSP_DEFAULTS).value.sweepIndicator) return null;
    const shown = this.statuses.value.filter((one) => one.sweep);
    const broken = this.statuses.value.filter((one) => one.state === 'failed');
    if (shown.length === 0 && broken.length === 0) return null;
    const tips = this.tips;

    const plates = [
      ...broken.map((status) => {
        const why = this.ide.t('lsp.down.about', { server: status.server, why: status.detail ?? '' });
        return (
          <button
            key={`down:${status.server}`}
            type="button"
            class="lsp-sweep-one is-down"
            onClick={() => this.revealServers()}
            onMouseEnter={
              tips ? (event: MouseEvent) => tips.show(event.currentTarget as Element, why) : undefined
            }
            onMouseLeave={tips ? () => tips.hide() : undefined}
          >
            <ServerBadge server={status.server} />
            <span class="lsp-sweep-files">{this.ide.t('lsp.down.files')}</span>
          </button>
        );
      }),
      ...shown.map((status) => {
          const sweep = status.sweep!;
          const working = sweep.stopped === null;
          const over = sweep.mb !== null && sweep.mb > sweep.budgetMb;
          const capped = over || sweep.stopped === 'budget' || sweep.stopped === 'baseline';
          const about = this.ide.t('lsp.sweep.about', {
            server: status.server,
            checked: sweep.checked,
            total: sweep.total,
          });
          return (
            <button
              key={status.server}
              type="button"
              class={`lsp-sweep-one ${working ? 'is-working' : ''} ${capped ? 'is-capped' : ''}`}
              onClick={() => this.revealBudget()}
              onMouseEnter={
                tips ? (event: MouseEvent) => tips.show(event.currentTarget as Element, about) : undefined
              }
              onMouseLeave={tips ? () => tips.hide() : undefined}
            >
              <ServerBadge server={status.server} />
              <span class="lsp-sweep-files">
                {this.ide.t('lsp.sweep.files', { checked: sweep.checked, total: sweep.total })}
              </span>
              {sweep.mb !== null && (
                <span class="lsp-sweep-mb">
                  {this.ide.t('lsp.sweep.memory', { mb: sweep.mb, budget: sweep.budgetMb })}
                </span>
              )}
            </button>
          );
      }),
    ];

    return <span class="lsp-sweep">{plates}</span>;
  }

  hover(path: string, line: number, character: number): Promise<HoverInfo | null> {
    return this.askHover({ path, line, character });
  }

  definition(path: string, line: number, character: number): Promise<SymbolSite[]> {
    return this.askDefinition({ path, line, character });
  }

  references(path: string, line: number, character: number): Promise<SymbolSite[]> {
    return this.askReferences({ path, line, character });
  }

  serves(path: string): boolean {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    if (dot <= 0) return false;
    const extension = name.slice(dot + 1).toLowerCase();
    const servers = this.ide.settingsOf('lsp', LSP_DEFAULTS).value.servers;
    return Object.values(servers).some((server) => server.enabled && server.extensions.includes(extension));
  }

  complete(path: string, line: number, character: number, trigger?: string): Promise<CompletionAnswer> {
    return this.askCompletion({ path, line, character, ...(trigger ? { trigger } : {}) });
  }

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
