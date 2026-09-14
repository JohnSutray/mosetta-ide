export interface FindSettings {
  masks: string[];
  masksOff: string[];
  maxHits: number;
}

const SUGGESTED_MASKS = [
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.json',
  '*.css',
  '*.scss',
  '*.html',
  '*.vue',
  '*.svelte',
  '*.md',
  '*.yml',
];

export const FIND_DEFAULTS: FindSettings = {
  masks: [...SUGGESTED_MASKS],
  masksOff: [...SUGGESTED_MASKS],
  maxHits: 500,
};

export const FIND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    masks: { type: 'array', items: { type: 'string' } },
    masksOff: { type: 'array', items: { type: 'string' } },
    maxHits: { type: 'number' },
  },
} as const;
