import type { Answer, Ask, Item, Source } from '../types.js';

const WORD = /[A-Za-z_$][\w$]*/g;
/** Shorter than this means `i`, `id`, `of`: noise rather than a suggestion. */
const MIN = 3;

/**
 * The open file's words — insurance where the checker stays silent: markdown, JSON,
 * CSS, untyped dynamics. Honestly marked as "just a word" (the `word` kind) rather than
 * as a property: WebStorm on an `any` reaches into its global index of names and
 * produces eight hundred items all mixed up — which is exactly the "rubbish completion"
 * we walked away from.
 *
 * After a dot in a file a language server looks after, we stay silent: the type's
 * members are its to name, and a word from a comment after a dot is untrue.
 */
export class BufferWords implements Source {
  readonly id = 'buffer';
  readonly weight = -20;

  constructor(private readonly typed: (path: string) => boolean) {}

  items(ask: Ask): Answer {
    if (ask.trigger === '.' && this.typed(ask.path)) return { items: [] };
    const seen = new Set<string>();
    const items: Item[] = [];
    for (const found of ask.text.matchAll(WORD)) {
      const word = found[0];
      const at = found.index ?? 0;
      if (at <= ask.pos && at + word.length >= ask.from) continue;
      if (word.length < MIN || seen.has(word)) continue;
      seen.add(word);
      items.push({ label: word, kind: 'word', source: this.id });
    }
    return { items };
  }
}
