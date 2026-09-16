export interface IndexSettings {
  enabled: boolean;
  maxResults: number;
  recentFiles: number;
  symbolsMaxKb: number;
}

export const INDEX_DEFAULTS: IndexSettings = { enabled: true, maxResults: 50, recentFiles: 15, symbolsMaxKb: 512 };

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
