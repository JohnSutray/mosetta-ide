export interface GitSettings {
  autoFetchMinutes: number;
}

export const GIT_DEFAULTS: GitSettings = { autoFetchMinutes: 10 };

export const GIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { autoFetchMinutes: { type: 'number' } },
} as const;
