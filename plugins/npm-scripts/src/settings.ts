/** The `tools` section of the settings file is ours. */
export interface ToolSettings {
  /** Empty means "as the project decides": the lockfile and the `packageManager` field. */
  packageManager: string;
}

export const TOOLS_DEFAULTS: ToolSettings = { packageManager: '' };

/** The shape of the section's value: the human's file is validated against it. */
export const TOOLS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { packageManager: { type: 'string' } },
} as const;
