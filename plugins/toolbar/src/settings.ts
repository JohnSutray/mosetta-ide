export interface ToolbarSettings {
  order: string[];
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
};
