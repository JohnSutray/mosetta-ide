import type { GitFileState } from './types.js';

/** What `git status` said: the states, and where a file moved from. */
export interface StatusReport {
  files: Record<string, GitFileState>;
  /**
   * A new path to the old one, for a renamed or a copied file.
   *
   * As a separate map rather than a new state: a colour in the tree means exactly three
   * things, and a fourth state would have to be painted. And a move is not "how the
   * file changed" but "where it came from", and it is asked about elsewhere: in the
   * change list, and in the diff, which without the old name has nothing to ask "how it
   * was" of.
   */
  moved: Record<string, string>;
}

/**
 * Parsing `git status --porcelain -z`.
 *
 * A class of its own rather than a method of the index: parsing a string needs neither
 * a root, nor a journal, nor a subscription, and a test has to call it without any of
 * that.
 */
export class GitStatus {
  /**
   * Parsing `git status --porcelain -z`. The records are separated by a zero, and
   * renames have TWO paths in a row — the new one and the old — so we walk with a
   * cursor rather than splitting by lines.
   */
  parse(raw: string): StatusReport {
    const files: Record<string, GitFileState> = {};
    const moved: Record<string, string> = {};
    const tokens = raw.split('\0');
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!token || token.length < 4) continue;
      const x = token[0]!;
      const y = token[1]!;
      const path = token.slice(3);
      if (x === 'R' || x === 'C') {
        i += 1;
        const from = tokens[i];
        if (from) moved[path] = from;
      }
      files[path] = classify(x, y);
    }
    return { files, moved };
  }
}

/** One per process: pure parsing. */
export const gitStatus = new GitStatus();

function classify(x: string, y: string): GitFileState {
  if (x === '?' && y === '?') return 'untracked';
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
    return 'conflict';
  }
  if (x === 'D' || y === 'D') return 'deleted';
  if (x === 'A') return 'added';
  return 'modified';
}
