
export type GitFileState = 'modified' | 'added' | 'untracked' | 'deleted' | 'conflict';

export interface GitState {
  repo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  files: Record<string, GitFileState>;
  moved: Record<string, string>;
  error?: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  head: string;
  subject?: string;
}

export type GitAction =
  | 'checkout'
  | 'create'
  | 'rename'
  | 'delete'
  | 'force-delete'
  | 'push'
  | 'force-push'
  | 'pull'
  | 'fetch'
  | 'merge';

export interface GitChange {
  path: string;
  state: GitFileState;
}

export interface GitCommit {
  short: string;
  subject: string;
  body?: string;
  author: string;
  date: string;
}

export interface PushPreview {
  branch: string | null;
  upstream: string | null;
  common: GitCommit[];
  remote: GitCommit[];
  local: GitCommit[];
}
