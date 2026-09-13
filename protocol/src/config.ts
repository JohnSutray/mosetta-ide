

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

export interface PluginSettings {
  enabled: string[];
}

export type SettingValue = string | number | boolean | string[];

export interface Settings {
  plugins: PluginSettings;
  fs: FsSettings;
  [section: string]: unknown;
}

export type KeyContext =
  | 'global'
  | 'editor'
  | 'tree'
  | 'search'
  | 'projects'
  | 'pick'
  | 'prompt'
  | 'branch-name'
  | 'menu'
  | 'push'
  | 'terminal'
  | 'keys'
  | 'merge'
  | 'settings'
  | 'find'
  | 'find-multiline'
  | 'find-replace'
  | 'find-files'
  | 'find-files-mask'
  | 'completion'
  | 'editable';

export type KeyHost = 'browser' | 'electron';

export type KeyOs = 'mac' | 'win' | 'linux';

export type KeyScope = KeyHost | `${KeyHost}:${KeyOs}`;

export interface KeyBinding {
  command: string;
  key: string;
  when?: KeyContext;
  remove?: true;
  where?: KeyScope[];
}

export interface Keymap {
  version: number;
  bindings: KeyBinding[];
}

export type SettingScope = 'user' | 'project';

export interface ConfigBundle {
  settings: Settings;
  keymap: Keymap;
  sources: string[];
  user: Record<string, Record<string, unknown>>;
  defaults: Settings;
  project: Record<string, Record<string, unknown>>;
  projectFile: string | null;
}
