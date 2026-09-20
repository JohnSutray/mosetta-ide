
export type Autosave =
  | 'off'
  | 'focusLost';

export interface DocSettings {
  autosave: Autosave;
}

export const DOC_DEFAULTS: DocSettings = {
  autosave: 'off',
};

export const DOC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    autosave: { type: 'string', enum: ['off', 'focusLost'] },
  },
} as const;

export const DOC_FIELDS = {
  autosave: { options: ['off', 'focusLost'] },
} as const;
