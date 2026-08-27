import type { Settings } from '@ide/protocol';

export const DEFAULT_SETTINGS_FALLBACK: Settings = {
  plugins: { enabled: [] },
  editor: {
    fontFamily: 'JetBrains Mono',
    fontSize: 13,
    tabSize: 2,
    lineNumbers: true,
    caretWidth: 2,
    ligatures: false,
  },
  fs: {
    hidden: [],
    noScan: [],
    maxFileMb: 8,
    preloadBudgetMb: 64,
    textExtensions: [],
    watch: true,
    watchDebounceMs: 60,
  },
  index: { enabled: true, maxResults: 50 },
  lsp: { startOnOpen: true, checkProject: true, checkProjectLimit: 2000, servers: {} },
  git: { autoFetchMinutes: 10 },
  tree: { followEditor: true },
  terminal: { shell: '', args: [] },
  tools: { packageManager: '' },
};
