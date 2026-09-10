import { highlightCode, type Highlighter } from '@lezer/highlight';
import { LanguageSupport } from '@codemirror/language';
import type { Languages } from './languages.js';

export interface Chunk {
  text: string;
  color: string | null;
}
export type CodeChunk = Chunk;

export class CodePainter {
  private readonly cache = new Map<string, Chunk[]>();
  private readonly cacheMax = 4000;

  constructor(
    private readonly languages: Languages,
    private readonly look: () => { readonly highlighter: Highlighter },
  ) {}

  paint(text: string, path: string): Chunk[] {
    const key = `${path} ${text}`;
    const known = this.cache.get(key);
    if (known) return known;

    const painted = this.parse(text, path);
    if (this.cache.size >= this.cacheMax) this.cache.clear();
    this.cache.set(key, painted);
    return painted;
  }

  forget(): void {
    this.cache.clear();
  }

  private parse(text: string, path: string): Chunk[] {
    const support = this.languages.of(path);
    if (!(support instanceof LanguageSupport)) return [{ text, color: null }];

    const out: Chunk[] = [];
    try {
      const tree = support.language.parser.parse(text);
      highlightCode(
        text,
        tree,
        this.look().highlighter,
        (code, color) => out.push({ text: code, color: color || null }),
        () => out.push({ text: '\n', color: null }),
      );
    } catch {
      return [{ text, color: null }];
    }
    return out.length > 0 ? out : [{ text, color: null }];
  }
}
