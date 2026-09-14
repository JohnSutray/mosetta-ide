export interface IndexSettings {
  enabled: boolean;
  maxResults: number;
  recentFiles: number;
}

export const INDEX_DEFAULTS: IndexSettings = { enabled: true, maxResults: 50, recentFiles: 15 };

export const INDEX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    enabled: { type: 'boolean' },
    maxResults: { type: 'number' },
    recentFiles: { type: 'number' },
  },
} as const;
