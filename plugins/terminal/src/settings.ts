/** The `terminal` section of the settings file is ours. */
export interface TerminalSettings {
  /**
   * What to launch the terminal with. Empty means "as the system decides". A name is
   * looked up in PATH, its own on every machine; a path is taken as it is.
   */
  shell: string;
  /** The launch arguments. Empty means sensible ones, by the shell's name. */
  args: string[];
  /** The terminal's font. Empty means the editor's (`editor.fontFamily`). */
  fontFamily: string;
}

export const TERMINAL_DEFAULTS: TerminalSettings = { shell: '', args: [], fontFamily: '' };

/** The shape of the section's value: the user's file is validated against it. */
export const TERMINAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    shell: { type: 'string' },
    args: { type: 'array', items: { type: 'string' } },
    fontFamily: { type: 'string' },
  },
} as const;
