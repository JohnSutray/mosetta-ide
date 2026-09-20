import { highlightCode, type Highlighter } from '@lezer/highlight';
import { LanguageSupport } from '@codemirror/language';
import type { Languages } from './languages.js';

/**
 * Paint a piece of code in the same colours as the editor.
 *
 * A usage line is code, and it used to be shown in one shade of grey. In a list of
 * forty rows the eye looks for a familiar shape: where is the name, where is the quoted
 * string, where is the keyword. Without colour it reads every row whole.
 *
 * A real editor cannot be set up per row: there are two hundred of them, and two
 * hundred CodeMirrors will hang the tab. But our parsing is the very same — Lezer, the
 * same parser chosen by file extension — and the colours come from the same list the
 * editor's highlighting uses. There is nowhere for them to drift apart.
 *
 * It suits both a list row and a multi-line hint from a language server: the parsing is
 * the same, and newlines travel as separate pieces.
 *
 * The text is parsed OUTSIDE its file's context, so here and there the parser will be
 * wrong: a closing brace at the start of a line is rubbish to it rather than the end of
 * a block. That is a price everyone doing the same thing knows about: a list is read by
 * shape rather than by tree.
 */

export interface Chunk {
  text: string;
  /** A colour, or `null` for the ordinary text colour. */
  color: string | null;
}
/** The same under the name the contract used to call it by. */
export type CodeChunk = Chunk;

/**
 * Painting in pieces.
 *
 * A class, and here it is not even about the rule: it has REAL state — a cache. A
 * module-level map that can neither be cleared from outside, nor inspected, nor
 * duplicated is exactly what that rule exists against.
 */
export class CodePainter {
  /**
   * Parsing a line costs a fraction of a millisecond, but a list is redrawn on every
   * press of an arrow key — with the same rows in it. The cache is small and shared:
   * one and the same file turns up in a list as dozens of rows.
   */
  private readonly cache = new Map<string, Chunk[]>();
  private readonly cacheMax = 4000;

  constructor(
    private readonly languages: Languages,
    /** The look, lazily: the colours belong to the theme, and the theme is a neighbour. */
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

  /** Forget what was parsed: the language was overridden, the colours changed. */
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
