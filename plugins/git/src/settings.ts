export interface GitSettings {
  autoFetchMinutes: number;
  statusPollSec: number;
}

export const GIT_DEFAULTS: GitSettings = { autoFetchMinutes: 10, statusPollSec: 3 };

export const GIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { autoFetchMinutes: { type: 'number' }, statusPollSec: { type: 'number' } },
} as const;
