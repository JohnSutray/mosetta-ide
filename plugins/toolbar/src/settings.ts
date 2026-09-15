export interface ToolbarSettings {
  order: string[];
  daemonMemory: boolean;
}

export const TOOLBAR_DEFAULTS: ToolbarSettings = {
  order: [
    'panel.tree',
    'search.everywhere',
    'git.branches',
    'git.push',
    'terminal.create',
    'projects.show',
    'panel.editor',
    'keys.show',
    'tree.follow',
  ],
  daemonMemory: true,
};

export const TOOLBAR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    order: { type: 'array', items: { type: 'string' } },
    daemonMemory: { type: 'boolean' },
  },
} as const;
