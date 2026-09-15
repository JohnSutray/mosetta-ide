export interface FindSettings {
  masks: string[];
  masksOff: string[];
  excludes: string[];
  excludesOff: string[];
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

const JUNK = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'Cargo.lock',
  'poetry.lock',
  'composer.lock',
  '*.min.js',
  '*.min.css',
  '*.map',
];

export const FIND_DEFAULTS: FindSettings = {
  masks: [...SUGGESTED_MASKS],
  masksOff: [...SUGGESTED_MASKS],
  excludes: [...JUNK],
  excludesOff: [],
  maxHits: 500,
};

export const FIND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    masks: { type: 'array', items: { type: 'string' } },
    masksOff: { type: 'array', items: { type: 'string' } },
    excludes: { type: 'array', items: { type: 'string' } },
    excludesOff: { type: 'array', items: { type: 'string' } },
    maxHits: { type: 'number' },
  },
} as const;
