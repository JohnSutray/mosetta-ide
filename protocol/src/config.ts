

export interface FsSettings {
  hidden: string[];
  noScan: string[];
  maxFileMb: number;
  preloadBudgetMb: number;
  textExtensions: string[];
  watch: boolean;
  watchDebounceMs: number;
}

export const FS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hidden: { type: 'array', items: { type: 'string' } },
    noScan: { type: 'array', items: { type: 'string' } },
    maxFileMb: { type: 'number' },
    preloadBudgetMb: { type: 'number' },
    textExtensions: { type: 'array', items: { type: 'string' } },
    watch: { type: 'boolean' },
    watchDebounceMs: { type: 'number' },
  },
} as const;

export interface UiSettings {
  locale: string;
}

export const UI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { locale: { type: 'string' } },
} as const;

export interface PluginSettings {
  enabled: string[];
}

export type SettingValue =
  | string
  | number
  | boolean
  | SettingValue[]
  | { [key: string]: SettingValue };

export interface Settings {
  plugins: PluginSettings;
  fs: FsSettings;
  ui: UiSettings;
  [section: string]: unknown;
}

export type SettingScope = 'user' | 'project';

export interface ConfigBundle {
  settings: Settings;
  sources: string[];
  user: Record<string, Record<string, unknown>>;
  defaults: Settings;
  project: Record<string, Record<string, unknown>>;
  projectFile: string | null;
}
