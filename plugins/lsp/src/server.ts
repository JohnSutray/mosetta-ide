import { activate, command, type CallContext, type Ide } from '@mosetta/ide-api/server';
import { LspHost } from './host.js';
import { LSP_DEFAULTS } from './settings.js';
import type { CompletionAnswer, CompletionDetails, FileDiagnostics, HoverInfo, LspStatus, SymbolSite } from './types.js';

/**
 * The language servers' server half.
 *
 * It stands on the three things the core handed over in the contract for the sake of
 * this move: `project.memory` (the text comes from memory rather than from disk),
 * `project.start` (a process in the shared ledger, dying with the project) and
 * `ide.onProject` (it starts when the project opens — requirement five). The core's
 * `lsp.*` methods are gone: a tab comes here through `plugins.call`, and diagnostics
 * travel as events.
 */
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

  /**
   * Everything the servers have already counted about the project. Asked on connecting
   * to a project: a tab may have missed the events — the check runs in the background
   * and finishes whenever it finishes.
   */
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

  /**
   * Where a symbol is declared and where it is used. Both questions are asked the same
   * way, so their parameter parsing is shared too.
   */
  @command() protected definition(params: unknown, call: CallContext): Promise<SymbolSite[]> {
    const { path, line, character } = spot(params);
    return this.host(call).require(path).definition(path, line, character);
  }

  @command() protected references(params: unknown, call: CallContext): Promise<SymbolSite[]> {
    const { path, line, character } = spot(params);
    return this.host(call).require(path).references(path, line, character);
  }

  /**
   * What can be inserted at this place. `trigger` is the character that opened the list
   * (a dot); without it, "it was called".
   */
  @command() protected completion(params: unknown, call: CallContext): Promise<CompletionAnswer> {
    const { path, line, character } = spot(params);
    const trigger = (params as { trigger?: unknown }).trigger;
    return this.host(call)
      .require(path)
      .completion(path, line, character, typeof trigger === 'string' ? trigger : undefined);
  }

  /** Read an item in: the documentation and the auto-import line. */
  @command() protected resolve(params: unknown, call: CallContext): Promise<CompletionDetails> {
    const path = pathOf(params);
    return this.host(call).require(path).resolveCompletion((params as { item?: unknown }).item);
  }
}

function pathOf(params: unknown): string {
  const asked = params as { path?: unknown } | null;
  if (!asked || typeof asked.path !== 'string') throw new Error('path: string required');
  return asked.path;
}

function spot(params: unknown): { path: string; line: number; character: number } {
  const path = pathOf(params);
  const asked = params as { line?: unknown; character?: unknown };
  if (typeof asked.line !== 'number' || typeof asked.character !== 'number') {
    throw new Error('line and character required');
  }
  return { path, line: asked.line, character: asked.character };
}
