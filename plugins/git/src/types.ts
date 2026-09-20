
/**
 * A file's state in git's eyes. This is exactly what paints a name in the tree: a
 * colour there means git status and nothing else.
 */
export type GitFileState = 'modified' | 'added' | 'untracked' | 'deleted' | 'conflict';

/**
 * A snapshot of the repository. It lies in the server's memory and is handed over
 * instantly: no key has the right to wait for an external process, so `git` spins in
 * the background while the protocol hands over what has already been computed.
 */
export interface GitState {
  /** Is the project under git at all? If not, the tree simply stays grey. */
  repo: boolean;
  branch: string | null;
  /** How far the current branch is ahead of or behind its upstream. */
  ahead: number;
  behind: number;
  /**
   * Path to state. Changed files only: there are thousands of clean files in a project,
   * and listing them would mean pushing the whole project over the socket on every
   * twitch.
   */
  files: Record<string, GitFileState>;
  /**
   * A new path to where the file moved from. Empty means there are no moves; the change
   * list and the diff ask about those, while a colour in the tree still means exactly
   * three things.
   */
  moved: Record<string, string>;
  /** git's last complaint, if it did not work. */
  error?: string;
}

export interface GitBranch {
  /** A short name: `main`, `origin/main`. */
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  /** How many of our commits can be sent to the remote. */
  ahead: number;
  /** How many of theirs can be taken from it. */
  behind: number;
  /** The last commit's short sha and subject — for the tooltip. */
  head: string;
  subject?: string;
}

/**
 * What can be done with a branch. The list is closed, and that is protection rather
 * than a limitation: the client does NOT pass git arguments — it names an action, and
 * the server assembles the command. Otherwise any page that reached the socket could
 * run anything at all in the repository.
 */
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

/** A file touched by a commit or by a batch of commits. */
export interface GitChange {
  path: string;
  state: GitFileState;
}

export interface GitCommit {
  short: string;
  subject: string;
  /** The rest of the message, if there is any. It is shown under the tree of files. */
  body?: string;
  author: string;
  /** A date as `2026-08-21` — it does not need sorting, only showing. */
  date: string;
}

/**
 * What will happen on a push. Three groups of commits, and the order in them is the one
 * they are shown in: the shared history, then what appeared in the remote, then yours.
 */
export interface PushPreview {
  branch: string | null;
  upstream: string | null;
  /** The last shared commits — the tail of the shared history, newest at the end. */
  common: GitCommit[];
  /** Present in the remote, absent from ours. It is these a force push will overwrite. */
  remote: GitCommit[];
  /** Present in ours, absent from the remote. These are what we send. */
  local: GitCommit[];
}
