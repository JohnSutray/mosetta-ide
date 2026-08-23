import { highlightCode } from '@lezer/highlight';
import { LanguageSupport } from '@codemirror/language';
import { languageFor } from './languages.js';
import { inkHighlighter } from './darcula.js';

export interface Chunk {
  text: string;
  color: string | null;
}

const CACHE = new Map<string, Chunk[]>();
const CACHE_MAX = 4000;

export function paintLine(text: string, path: string): Chunk[] {
  const key = `${path} ${text}`;
  const known = CACHE.get(key);
  if (known) return known;

  const painted = paint(text, path);
  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(key, painted);
  return painted;
}

function paint(text: string, path: string): Chunk[] {
  const support = languageFor(path);
  if (!(support instanceof LanguageSupport)) return [{ text, color: null }];

  const out: Chunk[] = [];
  try {
    const tree = support.language.parser.parse(text);
    highlightCode(
      text,
      tree,
      inkHighlighter,
      (code, color) => out.push({ text: code, color: color || null }),
      () => out.push({ text: ' ', color: null }),
    );
  } catch {
    return [{ text, color: null }];
  }
  return out.length > 0 ? out : [{ text, color: null }];
}
