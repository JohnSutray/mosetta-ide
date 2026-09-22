
/**
 * When to save by itself.
 *
 * An enumeration rather than a flag: a flag `autosave: true` does not say WHEN, and
 * that is the whole question here — WebStorm writes on a timer, on the window losing
 * focus, and before running. There are two occasions today, and both are named.
 */
export type Autosave =
  /** Do not save by itself. Factory: writing to disk is the user's decision. */
  | 'off'
  /**
   * The keyboard has left the text: a click into the tree, the search opened, away into
   * another window. The same occasion WebStorm writes on, and the one on which the
   * user is no longer typing.
   */
  | 'focusLost';

export interface DocSettings {
  autosave: Autosave;
}

export const DOC_DEFAULTS: DocSettings = {
  autosave: 'off',
};

/** The shape of the section's value: the user's file is validated against it. */
export const DOC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    autosave: { type: 'string', enum: ['off', 'focusLost'] },
  },
} as const;

/** What the settings screen knows about the field beyond its default: the options. */
export const DOC_FIELDS = {
  autosave: { options: ['off', 'focusLost'] },
} as const;
