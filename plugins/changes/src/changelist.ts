
/** A changelist: a name, and the files the user has put aside into it. */
export interface Changelist {
  id: string;
  name: string;
  /** The paths assigned HERE. `changes` has none: everything else is there. */
  files: string[];
}

/** Where everything falls by default. It cannot be deleted. */
export const DEFAULT_LIST = 'changes';
/** Where the conflicts fall. It cannot be deleted either — nor renamed. */
export const UNRESOLVED_LIST = 'unresolved';
/** The two reserved names: they are set up by the panel rather than by the user. */
export const RESERVED = [DEFAULT_LIST, UNRESOLVED_LIST];
