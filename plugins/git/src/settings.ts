/** The `git` section of the settings file is ours. */
export interface GitSettings {
  /** How often to ask the remote; zero means do not ask. */
  autoFetchMinutes: number;
  /**
   * How often to re-read the files' state, in seconds; zero means do not re-read.
   *
   * Normally the snapshot is updated by MEMORY: git sees an edit from the editor at
   * once. The poll is for what is done past us — a commit in a terminal, switching
   * branch, a `git checkout` by a neighbouring tool: `.git` lies in `noScan`, and the
   * watcher deliberately does not look there.
   */
  statusPollSec: number;
}

export const GIT_DEFAULTS: GitSettings = { autoFetchMinutes: 10, statusPollSec: 3 };

/** The shape of the section's value: the user's file is validated against it. */
export const GIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { autoFetchMinutes: { type: 'number' }, statusPollSec: { type: 'number' } },
} as const;
