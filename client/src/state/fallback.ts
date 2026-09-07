import type { Settings } from '@ide/protocol';

export const DEFAULT_SETTINGS_FALLBACK: Settings = {
  plugins: { enabled: [] },
  fs: {
    hidden: [],
    noScan: [],
    maxFileMb: 8,
    preloadBudgetMb: 64,
    textExtensions: [],
    watch: true,
    watchDebounceMs: 60,
  },
};
