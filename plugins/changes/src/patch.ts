export interface PatchHunk {
  from: number;
  count: number;
  lines: string[];
}

export interface PatchFile {
  path: string;
  hunks: PatchHunk[];
  binary: boolean;
  base: { object: string; mode: string } | null;
}

export class PatchReader {
  read(text: string): PatchFile[] {
    const files: PatchFile[] = [];
    let file: PatchFile | null = null;
    let hunk: PatchHunk | null = null;

    for (const line of (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')) {
      const started = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      if (started) {
        file = { path: started[2] ?? started[1] ?? '', hunks: [], binary: false, base: null };
        hunk = null;
        files.push(file);
        continue;
      }
      if (!file) continue;
      const index = /^index ([0-9a-f]+)\.\.[0-9a-f]+(?: (\d{6}))?$/.exec(line);
      if (index) {
        const object = index[1]!;
        if (!/^0+$/.test(object)) file.base = { object, mode: index[2] ?? '100644' };
        continue;
      }
      if (line.startsWith('GIT binary patch')) {
        file.binary = true;
        continue;
      }
      const head = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
      if (head) {
        hunk = { from: Number(head[1]), count: head[2] === undefined ? 1 : Number(head[2]), lines: [] };
        file.hunks.push(hunk);
        continue;
      }
      if (!hunk) continue;
      if (line.startsWith('\\')) continue;
      if (line === '' || line.startsWith(' ') || line.startsWith('-') || line.startsWith('+')) {
        hunk.lines.push(line === '' ? ' ' : line);
        continue;
      }
      hunk = null;
    }
    return files;
  }

  apply(text: string, hunks: PatchHunk[]): string | null {
    const lines = text === '' ? [] : text.split('\n');
    const trailing = lines.length > 1 && lines[lines.length - 1] === '';
    if (trailing) lines.pop();

    const out: string[] = [];
    let at = 0;
    for (const hunk of hunks) {
      const start = Math.max(0, hunk.from - 1);
      if (start < at || start > lines.length) return null;
      out.push(...lines.slice(at, start));
      at = start;
      for (const line of hunk.lines) {
        const body = line.slice(1);
        if (line.startsWith('+')) {
          out.push(body);
          continue;
        }
        if (lines[at] !== body) return null;
        at += 1;
        if (line.startsWith(' ')) out.push(body);
      }
    }
    out.push(...lines.slice(at));
    return out.length === 0 ? '' : `${out.join('\n')}${trailing ? '\n' : ''}`;
  }
}
