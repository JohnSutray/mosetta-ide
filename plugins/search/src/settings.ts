export interface IndexSettings {
  enabled: boolean;
  maxResults: number;
}

export const INDEX_DEFAULTS: IndexSettings = { enabled: true, maxResults: 50 };

export const INDEX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    enabled: { type: 'boolean' },
    maxResults: { type: 'number' },
  },
} as const;
