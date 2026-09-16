
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
  | 'keymap-edit'
  | 'merge'
  | 'changes'
  | 'settings'
  | 'find'
  | 'debug-edit'
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

export interface TipsLike {
  show(target: Element, title: string, keys?: string[]): void;
  hide(): void;
}
