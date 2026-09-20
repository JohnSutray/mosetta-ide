/** The `tree` section of the settings file is ours. */
export interface TreeSettings {
  /** The tree follows the caret, as in IDEA. The toolbar's toggle writes here too. */
  followEditor: boolean;
}

export const TREE_DEFAULTS: TreeSettings = { followEditor: true };

/** The shape of the section's value: the human's file is validated against it. */
export const TREE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { followEditor: { type: 'boolean' } },
} as const;
