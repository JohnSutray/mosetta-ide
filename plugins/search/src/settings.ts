export interface IndexSettings {
  enabled: boolean;
  maxResults: number;
}

export const INDEX_DEFAULTS: IndexSettings = { enabled: true, maxResults: 50 };
