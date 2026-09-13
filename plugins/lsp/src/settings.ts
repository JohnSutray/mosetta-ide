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
  checkProjectLimit: number;
  servers: Record<string, LspServerSettings>;
}

export const LSP_DEFAULTS: LspSettings = {
  startOnOpen: true,
  checkProject: true,
  checkProjectLimit: 2000,
  servers: {},
};

export const LSP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    startOnOpen: { type: 'boolean' },
    checkProject: { type: 'boolean' },
    checkProjectLimit: { type: 'number' },
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
