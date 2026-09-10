import { activate, command, type CallContext, type Ide } from '@ide/api/server';
import { LspHost } from './host.js';
import { LSP_DEFAULTS } from './settings.js';
import type { CompletionAnswer, CompletionDetails, FileDiagnostics, HoverInfo, LspStatus, SymbolSite } from './types.js';

export default class LspServerPlugin {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.onProject((project) => {
      const host = project.use('servers', () => new LspHost(project, this.ide));
      if (this.ide.settings('lsp', LSP_DEFAULTS).startOnOpen) host.start();
    });
  }

  private host(call: CallContext): LspHost {
    return call.project.use('servers', () => new LspHost(call.project, this.ide));
  }

  @command() protected status(_params: unknown, call: CallContext): LspStatus[] {
    return this.host(call).statuses();
  }

  @command() protected problems(_params: unknown, call: CallContext): FileDiagnostics[] {
    return this.host(call).known();
  }

  @command() protected diagnostics(params: unknown, call: CallContext): FileDiagnostics {
    const path = pathOf(params);
    return { path, diagnostics: this.host(call).diagnosticsFor(path) };
  }

  @command() protected hover(params: unknown, call: CallContext): Promise<HoverInfo | null> {
    const { path, line, character } = spot(params);
    return this.host(call).require(path).hover(path, line, character);
  }

  @command() protected definition(params: unknown, call: CallContext): Promise<SymbolSite[]> {
    const { path, line, character } = spot(params);
    return this.host(call).require(path).definition(path, line, character);
  }

  @command() protected references(params: unknown, call: CallContext): Promise<SymbolSite[]> {
    const { path, line, character } = spot(params);
    return this.host(call).require(path).references(path, line, character);
  }

  @command() protected completion(params: unknown, call: CallContext): Promise<CompletionAnswer> {
    const { path, line, character } = spot(params);
    const trigger = (params as { trigger?: unknown }).trigger;
    return this.host(call)
      .require(path)
      .completion(path, line, character, typeof trigger === 'string' ? trigger : undefined);
  }

  @command() protected resolve(params: unknown, call: CallContext): Promise<CompletionDetails> {
    const path = pathOf(params);
    return this.host(call).require(path).resolveCompletion((params as { item?: unknown }).item);
  }
}

function pathOf(params: unknown): string {
  const asked = params as { path?: unknown } | null;
  if (!asked || typeof asked.path !== 'string') throw new Error('нужен path: string');
  return asked.path;
}

function spot(params: unknown): { path: string; line: number; character: number } {
  const path = pathOf(params);
  const asked = params as { line?: unknown; character?: unknown };
  if (typeof asked.line !== 'number' || typeof asked.character !== 'number') {
    throw new Error('нужны line и character');
  }
  return { path, line: asked.line, character: asked.character };
}
