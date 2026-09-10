import { activate, configSection, project, remote, settingsOf, stub, workspaces } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { computed, effect, type ReadonlySignal } from '@preact/signals';
import { LSP_DEFAULTS } from './settings.js';
import { Lsp } from './state.js';

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
import DocPlugin from '@ide/plugin-doc';

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
  Position,
  Range,
  Severity,
  SymbolSite,
  TextEdit,
} from './types.js';

@configSection({ section: 'lsp', defaults: LSP_DEFAULTS })
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
    this.ide.on('diagnostics', (payload) => {
      const event = payload as FileDiagnostics;
      this.lsp.set(event.path, event.diagnostics);
    });
    this.ide.on('status', (payload) => this.lsp.setStatus(payload as LspStatus));

    effect(() => {
      workspaces.current.value;
      this.lsp.reset();
    });

    effect(() => {
      if (!project.value) return;
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
      if (!path || !project.value) return;
      void this.askDiagnostics({ path })
        .then((known) => this.lsp.set(known.path, known.diagnostics))
        .catch(() => undefined);
    });
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
    const servers = settingsOf('lsp', LSP_DEFAULTS).value.servers;
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
