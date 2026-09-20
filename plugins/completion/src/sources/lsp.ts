import type { CompletionAnswer, CompletionDetails, CompletionEntry, Position } from '@mosetta/ide-plugin-lsp';
import type { Answer, Ask, Item, Source } from '../types.js';

/** What the source needs from the language server — exactly three questions. */
export interface LspWire {
  serves(path: string): boolean;
  complete(path: string, line: number, character: number, trigger?: string): Promise<CompletionAnswer>;
  resolveCompletion(path: string, item: unknown): Promise<CompletionDetails>;
}

/**
 * A type's members and auto-import come from the language server. WebStorm reproduces
 * its own type inference; we ask the original: after `foo.` tsserver enumerates the
 * members with TypeScript's real checker.
 *
 * Before asking we flush the edits to the server: they are glued together by a 150 ms
 * pause, and the server has to see the dot that was just typed. The documentation and
 * the import line come as a second request, lazily, for the selected item.
 */
export class LspCompletions implements Source {
  readonly id = 'lsp';
  readonly weight = 10;

  constructor(
    private readonly wire: LspWire,
    private readonly flush: () => Promise<void>,
  ) {}

  items(ask: Ask): Answer | Promise<Answer> {
    if (!this.wire.serves(ask.path)) return { items: [] };
    return this.flush()
      .then(() => this.wire.complete(ask.path, ask.line, ask.character, ask.trigger ?? undefined))
      .then((answer) => ({
        incomplete: answer.incomplete,
        items: answer.items.map((entry) => this.item(entry, ask)),
      }));
  }

  private item(entry: CompletionEntry, ask: Ask): Item {
    const from = entry.range ? this.offset(ask, entry.range.start) : ask.from;
    return {
      label: entry.label,
      kind: entry.kind,
      source: this.id,
      insert: entry.insert,
      ...(from !== ask.from ? { from } : {}),
      ...(entry.filterText ? { filter: entry.filterText } : {}),
      ...(entry.detail ? { detail: entry.detail } : {}),
      rank: this.rank(entry.sortText),
      ...(entry.deprecated ? { deprecated: true } : {}),
      resolve: () => this.wire.resolveCompletion(ask.path, entry.raw),
    };
  }

  /**
   * tsserver's `sortText` is a set of tiers: `10` local, `11` a member, `15` global,
   * `16` auto-import. We take it as a tier rather than as a sort key: it is crude, but
   * it knows what we do not.
   */
  rank(sortText: string): number {
    const step = Number.parseInt(sortText, 10);
    return Number.isFinite(step) ? Math.max(0, Math.min(9, step - 10)) : 5;
  }

  private offset(ask: Ask, at: Position): number {
    if (at.line === ask.line) return ask.pos - ask.character + at.character;
    let start = 0;
    for (let line = 0; line < at.line; line += 1) {
      const next = ask.text.indexOf('\n', start);
      if (next === -1) return ask.from;
      start = next + 1;
    }
    return start + at.character;
  }
}
