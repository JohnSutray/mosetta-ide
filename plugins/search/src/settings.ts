/** The `index` section of the settings file is ours. */
export interface IndexSettings {
  enabled: boolean;
  maxResults: number;
  /**
   * How many recent places to show on an empty field. Zero means do not show them at
   * all: a list on an empty field is not to everyone's taste, and it is switched off by
   * the same number that configures it.
   */
  recentFiles: number;
  /**
   * The symbol parsing ceiling, in kilobytes.
   *
   * A generated file — a minified bundle, a map, a snapshot — yields a parse tree of
   * monstrous size and almost no useful names: on a 760 KB bundle the parser cost 61 MB
   * of memory. Skipped files do not vanish silently: they end up in "N files have no
   * symbols".
   */
  symbolsMaxKb: number;
}

export const INDEX_DEFAULTS: IndexSettings = { enabled: true, maxResults: 50, recentFiles: 15, symbolsMaxKb: 512 };

/** The shape of the section's value: the human's file is validated against it. */
export const INDEX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    enabled: { type: 'boolean' },
    maxResults: { type: 'number' },
    recentFiles: { type: 'number' },
    symbolsMaxKb: { type: 'number' },
  },
} as const;
