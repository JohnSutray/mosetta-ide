
/**
 * A path suggestion for the picker. The path is absolute — the same case as opening a
 * workspace: there is no project yet, and nothing to compute it relative to.
 */
export interface DirSuggestion {
  path: string;
  name: string;
  /**
   * The next level, if it was asked for at once. The picker's tree drops down ready to
   * two levels and loads further on click.
   */
  children?: DirSuggestion[];
}

/**
 * A project that has been opened before. The list is known to the SERVER — the history
 * is one for every tab and survives a restart.
 */
export interface RecentProject {
  root: string;
  name: string;
  openedAt: number;
}
