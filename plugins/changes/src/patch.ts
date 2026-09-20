/** A hunk of a patch: where from, how many and which rows. */
export interface PatchHunk {
  /** The first row in the OLD text, from 1. */
  from: number;
  /** How many rows of the old text the hunk replaces. */
  count: number;
  /** The hunk's rows: a space is a common one, `-` was removed, `+` was added. */
  lines: string[];
}

/** One file inside a patch. */
export interface PatchFile {
  path: string;
  hunks: PatchHunk[];
  /** A binary file: git writes it in a format of its own, and there is no text in it. */
  binary: boolean;
  /**
   * The PREIMAGE: the object the patch was computed from, and its mode. The line `index
   * <was>..<became> <mode>` is not decoration: it is what a file no longer in the tree
   * is restored from. `null` means there was no preimage at all (a new file): `git
   * apply` can create such a thing itself.
   */
  base: { object: string; mode: string } | null;
}

/**
 * Reading a patch off the shelf.
 *
 * A patch is an ordinary `git diff`, and it has everything needed to show what is put
 * aside with the same diff as the working tree: we take the text from the commit and
 * LAY the hunks onto it. That gives two sides — "as in the commit" and "as it would be
 * if we applied the patch" — and then everything else works: the folds, the two
 * columns, the highlighting.
 *
 * Why not show the patch itself row by row, as it lies: then the view of what is put
 * aside and the view of the working tree would differ both in look and in what they can
 * do (a patch has no rows between the hunks, so there is nothing to unfold), while the
 * human is looking at one and the same thing — at their own edit.
 *
 * A class rather than a couple of functions: the parsing and the laying-on are one
 * group of knowledge about one format, and they can be substituted on an instance.
 */
export class PatchReader {
  /**
   * Break a patch into files. Unfamiliar rows are passed over in silence — there are
   * plenty of those in a diff.
   */
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

  /**
   * Lay the hunks onto the text.
   *
   * `null` means it did not fit: the patch was taken off a different commit, and
   * showing something "roughly similar" is not allowed. We check the context in exactly
   * the way `git apply` does without `--3way`: it did not match — it did not fit, and
   * that is said out loud.
   */
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
        if (lines[at] !== body) return null;         at += 1;
        if (line.startsWith(' ')) out.push(body);
      }
    }
    out.push(...lines.slice(at));
    return out.length === 0 ? '' : `${out.join('\n')}${trailing ? '\n' : ''}`;
  }
}
