import type { CommandId } from './commands.js';

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  lineNumbers: boolean;
  caretWidth: number;
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
}

export interface LspSettings {
  startOnOpen: boolean;
  servers: Record<string, LspServerSettings>;
}

export interface Settings {
  editor: EditorSettings;
  fs: FsSettings;
  index: IndexSettings;
  lsp: LspSettings;
}

export type KeyContext = 'global' | 'editor' | 'tree';

export type KeyHost = 'browser' | 'electron';

export interface KeyBinding {
  command: CommandId;
  key: string;
  when?: KeyContext;
  unavailable?: Partial<Record<KeyHost, string>>;
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
