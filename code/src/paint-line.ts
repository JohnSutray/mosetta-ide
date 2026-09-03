import { highlightCode } from '@lezer/highlight';
import { LanguageSupport } from '@codemirror/language';
import { languages } from './languages.js';
import { darcula } from './darcula.js';

export interface Chunk {
  text: string;
  color: string | null;
}
export type CodeChunk = Chunk;

export class CodePainter {
  private readonly cache = new Map<string, Chunk[]>();
  private readonly cacheMax = 4000;

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
    const support = languages.of(path);
    if (!(support instanceof LanguageSupport)) return [{ text, color: null }];

    const out: Chunk[] = [];
    try {
      const tree = support.language.parser.parse(text);
      highlightCode(
        text,
        tree,
        darcula.highlighter,
        (code, color) => out.push({ text: code, color: color || null }),
        () => out.push({ text: '\n', color: null }),
      );
    } catch {
      return [{ text, color: null }];
    }
    return out.length > 0 ? out : [{ text, color: null }];
  }
}

export const codePainter = new CodePainter();
