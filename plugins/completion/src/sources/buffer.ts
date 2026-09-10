import type { Answer, Ask, Item, Source } from '../types.js';

const WORD = /[A-Za-z_$][\w$]*/g;
const MIN = 3;

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
