export interface LspServerSettings {
  enabled: boolean;
  command: string;
  args: string[];
  extensions: string[];
  checkExtensions?: string[];
  preferences?: Record<string, unknown>;
}

export interface LspSettings {
  startOnOpen: boolean;
  checkProject: boolean;
  memoryBudgetMb: number;
  sweepIndicator: boolean;
  servers: Record<string, LspServerSettings>;
}

export const LSP_DEFAULTS: LspSettings = {
  startOnOpen: true,
  checkProject: true,
  memoryBudgetMb: 3072,
  sweepIndicator: true,
  servers: {},
};

export const LSP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    startOnOpen: { type: 'boolean' },
    checkProject: { type: 'boolean' },
    memoryBudgetMb: { type: 'number' },
    sweepIndicator: { type: 'boolean' },
    servers: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          command: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
          extensions: { type: 'array', items: { type: 'string' } },
          checkExtensions: { type: 'array', items: { type: 'string' } },
          preferences: { type: 'object' },
        },
      },
    },
  },
} as const;
