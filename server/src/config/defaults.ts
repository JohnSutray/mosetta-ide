import type { Keymap, Settings } from '@ide/protocol';

export const DEFAULT_SETTINGS: Settings = {
  editor: {
    fontFamily: 'JetBrains Mono',
    fontSize: 13,
    tabSize: 2,
    lineNumbers: true,
    caretWidth: 2,
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
    servers: {},
  },
};

export const EMPTY_KEYMAP: Keymap = { version: 1, bindings: [] };
