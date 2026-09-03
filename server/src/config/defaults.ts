import type { Keymap, Settings } from '@ide/protocol';

export class Defaults {
  readonly settings: Settings = {
    plugins: {
      enabled: [
        '@ide/plugin-tree',
        '@ide/plugin-merge',
        '@ide/plugin-symbols',
        '@ide/plugin-search',
        '@ide/plugin-terminal',
        '@ide/plugin-git',
        '@ide/plugin-npm-scripts',
        '@ide/plugin-rerun',
        '@ide/plugin-problems',
        '@ide/plugin-toolbar',
        '@ide/plugin-layout',
        '@ide/plugin-editor',
        '@ide/plugin-sheep',
      ],
    },
    toolbar: {
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
    },
    editor: {
      fontFamily: 'JetBrains Mono',
      fontSize: 13,
      tabSize: 2,
      lineNumbers: true,
      caretWidth: 2,
      ligatures: false,
    },
    tree: {
      followEditor: true,
    },
    fs: {
      hidden: ['.DS_Store'],
      noScan: ['node_modules', '.git', 'dist', 'build', 'coverage'],
      maxFileMb: 8,
      preloadBudgetMb: 64,
      textExtensions: [
        'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs',
        'json', 'jsonc', 'css', 'scss', 'html', 'htm', 'vue', 'svelte',
        'md', 'markdown', 'txt', 'yml', 'yaml', 'toml', 'el', 'sh', 'ps1',
      ],
      watch: true,
      watchDebounceMs: 60,
    },
    index: {
      enabled: true,
      maxResults: 50,
    },
    lsp: {
      startOnOpen: true,
      checkProject: true,
      checkProjectLimit: 2000,
      servers: {},
    },
    git: {
      autoFetchMinutes: 10,
    },
    tools: {
      packageManager: '',
    },
    terminal: {
      shell: '',
      args: [],
    },
  };

  readonly emptyKeymap: Keymap = { version: 1, bindings: [] };
}

export const defaults = new Defaults();
