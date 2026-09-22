/** The `daemon` section of the settings file is ours. */
export interface DaemonSettings {
  /**
   * Whether to show how much memory the daemon holds.
   *
   * Switchable, like the sweep badge: a permanent figure on screen is not needed by
   * everyone, and it is useful exactly when one suspects something.
   *
   * This used to be `toolbar.daemonMemory` — a setting belonging to the strip, although
   * it is about the instrument. The schema throws the old key out of a personal file,
   * naming it: renaming a setting is visible rather than silent.
   */
  memory: boolean;
}

export const DAEMON_DEFAULTS: DaemonSettings = { memory: true };

/** The shape of the section's value: the user's file is validated against it. */
export const DAEMON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    memory: { type: 'boolean' },
  },
} as const;
