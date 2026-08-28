import type { CommandId } from './commands.js';

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  lineNumbers: boolean;
  caretWidth: number;
  ligatures: boolean;
}

export interface FsSettings {
  hidden: string[];
  noScan: string[];
  maxFileMb: number;
  preloadBudgetMb: number;
  textExtensions: string[];
  watch: boolean;
  watchDebounceMs: number;
}

export interface IndexSettings {
  enabled: boolean;
  maxResults: number;
}

export interface LspServerSettings {
  enabled: boolean;
  command: string;
  args: string[];
  extensions: string[];
  checkExtensions?: string[];
}

export interface LspSettings {
  startOnOpen: boolean;
  checkProject: boolean;
  checkProjectLimit: number;
  servers: Record<string, LspServerSettings>;
}

export interface TreeSettings {
  followEditor: boolean;
}

export interface PluginSettings {
  enabled: string[];
}

export interface Settings {
  plugins: PluginSettings;
  toolbar: ToolbarSettings;
  editor: EditorSettings;
  tree: TreeSettings;
  fs: FsSettings;
  index: IndexSettings;
  lsp: LspSettings;
  git: GitSettings;
  terminal: TerminalSettings;
  tools: ToolSettings;
}

export interface ToolbarSettings {
  order: string[];
}

export interface ToolSettings {
  packageManager: string;
}

export interface TerminalSettings {
  shell: string;
  args: string[];
}

export interface GitSettings {
  autoFetchMinutes: number;
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
  | 'merge';

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
