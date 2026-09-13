export interface TreeSettings {
  followEditor: boolean;
}

export const TREE_DEFAULTS: TreeSettings = { followEditor: true };

export const TREE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { followEditor: { type: 'boolean' } },
} as const;
