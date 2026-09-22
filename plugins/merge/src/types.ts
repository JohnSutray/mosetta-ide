/**
 * The merging types — shared by both halves of the plugin. They used to lie in the
 * protocol: the core carried the word "session" around.
 */

export type MergeSource = 'fs' | 'git' | 'shelve';

/** One of the two versions. The left is always MINE, the right always THEIRS. */
export interface MergeSide {
  /** A dictionary key: "in the editor", "on disk", "our branch". */
  label: string;
  /** `null` means this side does not exist: the file was deleted. */
  text: string | null;
}

export interface MergeFile {
  path: string;
  /** The ancestor: what they diverged from. `null` means there is none. */
  base: string | null;
  left: MergeSide;
  right: MergeSide;
  /** Confirmed: the result has already gone to the supplier. */
  done: boolean;
}

export interface MergeSession {
  id: string;
  source: MergeSource;
  /** A dictionary key: what caused the session. */
  title: string;
  files: MergeFile[];
}

/**
 * What the argument's SUPPLIER brings: the triples of text, and a telephone number.
 * Where the texts came from (disk diverged from memory, git stopped mid-rebase) and
 * what to do with the result is known to it.
 */
export interface MergeSupply {
  source: MergeSource;
  /** A dictionary key: what caused the session. */
  title: string;
  files: MergeFile[];
  /**
   * What to do with the finished text. `null` means the user accepted the deletion.
   * Throwing from here is possible and right: the complaint will be seen by whoever
   * confirmed.
   */
  apply(path: string, text: string | null): Promise<void>;
  /** Every file is settled. Here git continues a rebase, and the shelf removes an entry. */
  finish?(): Promise<void>;
  /** The user refused. Here git rolls the merge back. */
  cancel?(): Promise<void>;
}
