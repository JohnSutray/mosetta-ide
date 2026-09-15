
export interface GrepOptions {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  words: boolean;
}

export interface FileHit {
  path: string;
  line: number;
  from: number;
  to: number;
  text: string;
}

export interface GrepResult {
  hits: FileHit[];
  files: number;
  total: number;
  truncated: boolean;
  skipped: number;
}

export class Grep {
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

  masks(list: string[]): (path: string) => boolean {
    return this.match(list, true);
  }

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

  count(text: string, re: RegExp): number {
    let n = 0;
    re.lastIndex = 0;
    for (let match = re.exec(text); match; match = re.exec(text)) {
      if (match[0] === '') re.lastIndex += 1;
      n += 1;
    }
    return n;
  }

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
