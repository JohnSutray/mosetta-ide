import type { Settings } from '@mosetta/ide-protocol';

export class Defaults {
  readonly settings: Settings = {
    ui: { locale: 'en' },
    plugins: {
      enabled: [
        '@mosetta/ide-plugin-theme',
        '@mosetta/ide-plugin-ui',
        '@mosetta/ide-plugin-notifications',
        '@mosetta/ide-plugin-keymap',
        '@mosetta/ide-plugin-doc',
        '@mosetta/ide-plugin-lsp',
        '@mosetta/ide-plugin-tree',
        '@mosetta/ide-plugin-merge',
        '@mosetta/ide-plugin-symbols',
        '@mosetta/ide-plugin-search',
        '@mosetta/ide-plugin-projects',
        '@mosetta/ide-plugin-keys',
        '@mosetta/ide-plugin-visits',
        '@mosetta/ide-plugin-terminal',
        '@mosetta/ide-plugin-git',
        '@mosetta/ide-plugin-npm-scripts',
        '@mosetta/ide-plugin-rerun',
        '@mosetta/ide-plugin-problems',
        '@mosetta/ide-plugin-toolbar',
        '@mosetta/ide-plugin-layout',
        '@mosetta/ide-plugin-code',
        '@mosetta/ide-plugin-editor',
        '@mosetta/ide-plugin-find',
        '@mosetta/ide-plugin-completion',
        '@mosetta/ide-plugin-settings',
        '@mosetta/ide-plugin-sheep',
      ],
    },
    fs: {
      hidden: ['.DS_Store'],
      noScan: ['node_modules', '.git', 'dist', 'build', 'coverage'],
      maxFileMb: 8,
      preloadBudgetMb: 512,
      watch: true,
      watchDebounceMs: 60,
    },
  };
}

export const defaults = new Defaults();
