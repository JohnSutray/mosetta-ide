export interface TerminalSettings {
  shell: string;
  args: string[];
  fontFamily: string;
}

export const TERMINAL_DEFAULTS: TerminalSettings = { shell: '', args: [], fontFamily: '' };

export const TERMINAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    shell: { type: 'string' },
    args: { type: 'array', items: { type: 'string' } },
    fontFamily: { type: 'string' },
  },
} as const;
