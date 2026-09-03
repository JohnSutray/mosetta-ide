import type { GitFileState } from './types.js';

export class GitStatus {
  parse(raw: string): Record<string, GitFileState> {
    const files: Record<string, GitFileState> = {};
    const tokens = raw.split('\0');
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!token || token.length < 4) continue;
      const x = token[0]!;
      const y = token[1]!;
      const path = token.slice(3);
      if (x === 'R' || x === 'C') i += 1;
      files[path] = classify(x, y);
    }
    return files;
  }
}

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
