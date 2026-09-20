import type { Settings } from '@mosetta/ide-protocol';

/**
 * What to draw the first frame with while the settings are still travelling from the
 * server. Not "the application's defaults" — those live on the server — but a stand-in
 * for the few dozen milliseconds before the first `config.changed`.
 */
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
