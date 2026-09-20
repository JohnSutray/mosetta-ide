/**
 * Searching the project's texts — pure mechanics. Neither disk nor memory: the texts
 * are brought by the server half, and here there is only "what to search for", "in
 * which files" and "what was found". Which is why it is checked without a server.
 */

export interface GrepOptions {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  words: boolean;
}

export interface FileHit {
  path: string;
  /** The line, zero-based. */
  line: number;
  /** The match's columns within the line, zero-based. */
  from: number;
  to: number;
  /** The line's text — so that the list does not have to go after the file. */
  text: string;
}

export interface GrepResult {
  hits: FileHit[];
  /** How many files gave at least one match. */
  files: number;
  total: number;
  /** We hit the ceiling — we are showing less than everything, and we say so. */
  truncated: boolean;
  /**
   * How many files the exclusion chips kept out. "How many went past" specifically
   * rather than "how many matches were in them": to learn the second we would have to
   * read exactly what was decided not to read. A silent filter is the same silent
   * truncation, and a number next to the chips is the cheapest way not to commit one.
   */
  skipped: number;
}

export class Grep {
  /**
   * The regular expression from the query; `null` means there is nothing to search for,
   * or it is broken.
   */
  pattern(options: GrepOptions): RegExp | null {
    if (options.query === '') return null;
    let source = options.regex ? options.query : options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (options.words) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
    try {
      return new RegExp(source, `gmu${options.caseSensitive ? '' : 'i'}`);
    } catch {
      return null;
    }
  }

  /**
   * File masks: `*.ts`, `*.test.*`, `src/**`. With a slash they match the whole path,
   * without one the name. An empty list means every file.
   */
  masks(list: string[]): (path: string) => boolean {
    return this.match(list, true);
  }

  /**
   * Exclusions: the same mask language, with the opposite answer — "skip this file". An
   * empty list excludes nobody, so the default here is `false` rather than `true`.
   */
  excludes(list: string[]): (path: string) => boolean {
    return this.match(list, false);
  }

  private match(list: string[], empty: boolean): (path: string) => boolean {
    const clean = list.map((one) => one.trim()).filter(Boolean);
    if (clean.length === 0) return () => empty;
    const tests = clean.map((mask) => {
      const source = mask
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0001')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/\u0001/g, '.*');
      const re = new RegExp(`^${source}$`);
      const wholePath = mask.includes('/');
      return (path: string) => re.test(wholePath ? path : (path.split('/').pop() ?? path));
    });
    return (path) => tests.some((test) => test(path));
  }

  /**
   * The matches in one text. We search the whole text rather than line by line: a term
   * containing a newline has to be found the same way it is in the editor.
   */
  scan(path: string, text: string, re: RegExp, limit: number): FileHit[] {
    const hits: FileHit[] = [];
    const starts = this.lineStarts(text);
    re.lastIndex = 0;
    for (let match = re.exec(text); match && hits.length < limit; match = re.exec(text)) {
      if (match[0] === '') {
        re.lastIndex += 1;
        continue;
      }
      const line = this.lineAt(starts, match.index);
      const lineStart = starts[line]!;
      const lineEnd = line + 1 < starts.length ? starts[line + 1]! - 1 : text.length;
      hits.push({
        path,
        line,
        from: match.index - lineStart,
        to: Math.min(match.index + match[0].length, lineEnd) - lineStart,
        text: text.slice(lineStart, lineEnd).replace(/\r$/, ''),
      });
    }
    return hits;
  }

  /** How many matches will be replaced — by the same expression the search used. */
  count(text: string, re: RegExp): number {
    let n = 0;
    re.lastIndex = 0;
    for (let match = re.exec(text); match; match = re.exec(text)) {
      if (match[0] === '') re.lastIndex += 1;
      n += 1;
    }
    return n;
  }

  /**
   * Replace them all. In regex mode `$1` is a group, as in the editor; in literal mode
   * `$` is just a dollar rather than what `String.replace` thinks about it.
   */
  replace(text: string, re: RegExp, replacement: string, regex: boolean): string {
    re.lastIndex = 0;
    return regex ? text.replace(re, replacement) : text.replace(re, () => replacement);
  }

  private lineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1);
    return starts;
  }

  private lineAt(starts: number[], offset: number): number {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid]! <= offset) low = mid;
      else high = mid - 1;
    }
    return low;
  }
}

export const grep = new Grep();
