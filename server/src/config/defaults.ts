import type { Keymap, Settings } from '@ide/protocol';

export class Defaults {
  readonly settings: Settings = {
    plugins: {
      enabled: [
        '@ide/plugin-theme',
        '@ide/ui',
        '@ide/plugin-notifications',
        '@ide/plugin-keymap',
        '@ide/plugin-doc',
        '@ide/plugin-lsp',
        '@ide/plugin-tree',
        '@ide/plugin-merge',
        '@ide/plugin-symbols',
        '@ide/plugin-search',
        '@ide/plugin-projects',
        '@ide/plugin-keys',
        '@ide/plugin-visits',
        '@ide/plugin-terminal',
        '@ide/plugin-git',
        '@ide/plugin-npm-scripts',
        '@ide/plugin-rerun',
        '@ide/plugin-problems',
        '@ide/plugin-toolbar',
        '@ide/plugin-layout',
        '@ide/plugin-editor',
        '@ide/plugin-find',
        '@ide/plugin-sheep',
      ],
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
  };

  readonly emptyKeymap: Keymap = { version: 1, bindings: [] };
}

export const defaults = new Defaults();
