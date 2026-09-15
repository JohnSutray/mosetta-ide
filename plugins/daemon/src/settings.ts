export interface DaemonSettings {
  memory: boolean;
}

export const DAEMON_DEFAULTS: DaemonSettings = { memory: true };

export const DAEMON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    memory: { type: 'boolean' },
  },
} as const;
