
export type DiffMode = 'split' | 'unified';

export interface ChangesSettings {
  diffMode: DiffMode;
}

export const CHANGES_DEFAULTS: ChangesSettings = {
  diffMode: 'split',
};

export const CHANGES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    diffMode: { type: 'string', enum: ['split', 'unified'] },
  },
} as const;
