export interface DebugSettings {
  openBrowser: boolean;
  serverReady: string;
  browser: string;
  browserArgs: string[];
  webRoot: string;
}

export const DEBUG_DEFAULTS: DebugSettings = {
  openBrowser: true,
  serverReady: `https?://(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)(?::\\d+)?[^\\s"'<>)\\]]*`,
  browser: '',
  browserArgs: [],
  webRoot: '',
};

export const DEBUG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    openBrowser: { type: 'boolean' },
    serverReady: { type: 'string' },
    browser: { type: 'string' },
    browserArgs: { type: 'array', items: { type: 'string' } },
    webRoot: { type: 'string' },
  },
} as const;
