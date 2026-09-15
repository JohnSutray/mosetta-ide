import type { Settings } from '@mosetta/ide-protocol';

export const DEFAULT_SETTINGS_FALLBACK: Settings = {
  plugins: { enabled: [] },
  ui: { locale: 'en' },
  fs: {
    hidden: [],
    noScan: [],
    maxFileMb: 8,
    preloadBudgetMb: 512,
    watch: true,
    watchDebounceMs: 60,
  },
};
