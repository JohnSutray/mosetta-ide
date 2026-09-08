

export interface FsSettings {
  hidden: string[];
  noScan: string[];
  maxFileMb: number;
  preloadBudgetMb: number;
  textExtensions: string[];
  watch: boolean;
  watchDebounceMs: number;
}

export interface PluginSettings {
  enabled: string[];
}

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
  | 'find'
  | 'find-replace';

export type KeyHost = 'browser' | 'electron';

export type KeyOs = 'mac' | 'win' | 'linux';

export type KeyScope = KeyHost | `${KeyHost}:${KeyOs}`;

export interface KeyBinding {
  command: string;
  key: string;
  when?: KeyContext;
  where?: KeyScope[];
}

export interface Keymap {
  version: number;
  bindings: KeyBinding[];
}

export interface ConfigBundle {
  settings: Settings;
  keymap: Keymap;
  sources: string[];
}
