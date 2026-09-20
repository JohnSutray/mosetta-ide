/** The `find` section of the settings file is ours. */
export interface FindSettings {
  /**
   * File masks for the project search: `*.ts`, `src/**`. The chips above the popup are
   * them; add or remove a chip and the file is rewritten.
   */
  masks: string[];
  /**
   * Which of the masks are DISABLED right now: a chip accumulates, but only an enabled
   * one takes part in the search. Two lists rather than a list of pairs: a setting can
   * hold a list of strings, and both read in the file without decoding.
   */
  masksOff: string[];
  /**
   * What people do not want to see in the results: lock files, minified output, source
   * maps. The same chips as the masks, but on their own row — and eternally struck
   * through: a strikethrough here is not "disabled" but "I will not be in the results".
   */
  excludes: string[];
  /** Which of the exclusions are DISABLED right now — a mirror of the masks' list. */
  excludesOff: string[];
  /** How many matches to show: beyond that this is not a search but "select all". */
  maxHits: number;
}

/**
 * The factory masks are a HINT rather than a filter.
 *
 * An empty chip row did not say that masks exist at all: to learn about the filter one
 * first had to guess it was there and write one in by hand. So the row is not empty —
 * it holds what front-end work is most often filtered by — but they are ALL disabled:
 * enabled, they would silently narrow the search for someone who never asked for them.
 * A disabled chip is visible, struck through, and enabled with a click.
 *
 * The order goes from frequent to rare: chips are read left to right.
 */
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

/**
 * The factory exclusions are ENABLED, and that is deliberate.
 *
 * The inclusion masks travel disabled, because an enabled mask silently narrows the
 * search for someone who never asked for it. With exclusions it differs in exactly one
 * thing: the narrowing is VISIBLE. The chip stands above the results, painted and
 * struck through, is removed with one click, and how many files it kept out is written
 * next to it as a number. That is the difference between "silently cut" and "said out
 * loud".
 *
 * The list holds what makes a project search unreadable: lock files (one match per
 * version of every package), minified output and source maps (a line of a hundred
 * thousand characters). Neither is written by hand, so there is nothing to search there
 * either.
 */
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

/** The shape of the section's value: the human's file is validated against it. */
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
