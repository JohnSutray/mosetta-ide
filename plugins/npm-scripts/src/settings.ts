export interface ToolSettings {
  packageManager: string;
}

export const TOOLS_DEFAULTS: ToolSettings = { packageManager: '' };

export const TOOLS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { packageManager: { type: 'string' } },
} as const;
