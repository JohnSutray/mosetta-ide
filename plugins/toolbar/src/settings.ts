/**
 * The `toolbar` section of the settings file is ours.
 *
 * The order of the buttons, which is also the order of the digits: a list of COMMANDS.
 * Whatever is not in the list goes to the end in order of appearance; conditional
 * buttons always come after the numbered ones.
 */
export interface ToolbarSettings {
  order: string[];
}

export const TOOLBAR_DEFAULTS: ToolbarSettings = {
  order: [
    'panel.tree',
    'search.everywhere',
    'git.branches',
    'git.push',
    'panel.problems',
    'terminal.create',
    'projects.show',
    'panel.editor',
    'keys.show',
    'tree.follow',
    'panel.changes',
  ],
};

/** The shape of the section's value: the human's file is validated against it. */
export const TOOLBAR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    order: { type: 'array', items: { type: 'string' } },
  },
} as const;
