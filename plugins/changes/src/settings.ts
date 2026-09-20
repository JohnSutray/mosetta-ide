
/** How to show a diff: in two columns or as a single ribbon. */
export type DiffMode = 'split' | 'unified';

export interface ChangesSettings {
  /**
   * The factory one is TWO COLUMNS, as in WebStorm: an edit is a "before → after" pair,
   * and a pair is read as a pair. The ribbon stays for a narrow middle and for those
   * used to reading a diff as a patch.
   */
  diffMode: DiffMode;
}

export const CHANGES_DEFAULTS: ChangesSettings = {
  diffMode: 'split',
};

/** The shape of the section's value: the human's file is checked against it. */
export const CHANGES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    diffMode: { type: 'string', enum: ['split', 'unified'] },
  },
} as const;
