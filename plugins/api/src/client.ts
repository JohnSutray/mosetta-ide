import type { Windows } from '@ide/windows';
import type { Signal } from '@preact/signals';
import type {
  DirEntry,
  DocState,
  DocVersion,
  EntryKind,
  Keymap,
  Settings,
  WorkspaceInfo,
  SettingValue,
} from '@ide/protocol';

export interface Size {
  w: number;
  h: number;
}

export declare function t(key: string, params?: Record<string, string | number>): string;

export declare function runCommand(id: string): boolean;

export interface ResizerProps {
  id: string;
  side: 'left' | 'right';
  axis?: 'x' | 'y';
  limits: () => { min: number; max: number };
  defaultWidth: number;
}

export declare const settings: { readonly value: Settings | null };
export declare function settingsOf<T extends object>(section: string, defaults: T): { readonly value: T };

export declare const project: { readonly value: WorkspaceInfo | null };

export type { DirEntry, EntryKind } from '@ide/protocol';

export interface TreeWire {
  list(path: string): Promise<DirEntry[]>;
  onChanged(handler: (event: { path: string }) => void): () => void;
}
export declare const tree: TreeWire;

export interface FsAccess {
  create(path: string, kind: EntryKind): Promise<DirEntry>;
  move(from: string, to: string): Promise<DirEntry>;
  copy(from: string, to: string): Promise<DirEntry>;
  remove(path: string): Promise<void>;
  write(path: string, text: string): Promise<void>;
  writeBytes(path: string, base64: string): Promise<DirEntry>;
  absolute(path: string): Promise<string>;
}
export declare const fs: FsAccess;

export interface DocWire {
  open(path: string): Promise<DocState>;
  close(path: string): Promise<void>;
  edit(path: string, text: string, baseVersion: number): Promise<DocVersion>;
  save(path: string): Promise<DocState>;
  reload(path: string): Promise<DocState>;
  state(path: string): Promise<DocState>;
  onChanged(handler: (event: DocVersion) => void): () => void;
  onExternal(handler: (event: { path: string; revision: string }) => void): () => void;
  onDiverged(handler: (event: { path: string; reason: 'changed' | 'removed' }) => void): () => void;
  onMoved(handler: (event: { from: string; path: string }) => void): () => void;
  onRemoved(handler: (event: { path: string }) => void): () => void;
}
export declare const docs: DocWire;
export declare function setSetting(section: string, key: string, value: SettingValue): Promise<void>;

export interface WorkspacesAccess {
  readonly current: { readonly value: WorkspaceInfo | null };
  readonly live: { readonly value: WorkspaceInfo[] };
  open(root: string): Promise<void>;
  switchTo(id: string): Promise<void>;
}
export declare const workspaces: WorkspacesAccess;

export declare const keymap: { readonly value: Keymap };

export declare const connected: { readonly value: boolean };

export type NoteKind = 'info' | 'error' | 'work';
export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
  at: number;
}
export interface NotesAccess {
  readonly all: { readonly value: Note[] };
  notify(text: string, kind?: NoteKind): number;
  settle(id: number, text: string, kind?: NoteKind): number;
  dismiss(id: number): void;
  dismissAll(): void;
}
export declare const notes: NotesAccess;

export interface HunkBox {
  left: number;
  top: number;
  bottom: number;
}

export interface ClientSurface {
  t: typeof t;
  runCommand: typeof runCommand;
  keymap: typeof keymap;
  connected: typeof connected;
  notes: typeof notes;
  settings: typeof settings;
  settingsOf: typeof settingsOf;
  project: typeof project;
  tree: typeof tree;
  fs: typeof fs;
  docs: typeof docs;
  setSetting: typeof setSetting;
  workspaces: typeof workspaces;
}

export interface PluginToolbarEntry {
  id: string;
  title: string;
  icon: string | ((filled: boolean) => unknown);
  command: string;
  active?: { readonly value: boolean };
}

export interface Ide {
  readonly windows: Windows;
  readonly name: string;
  readonly rpc: { call(method: string, params?: unknown): Promise<unknown> };
  getPlugin<T>(ctor: PluginClass<T>): T;
  command(id: string, run: () => void): void;
  registry<T>(key: string): RegistryHandle<T>;
  remember<T>(key: string, initial: T, scope?: 'tab' | 'both'): Signal<T>;
  css(text: string): void;
  on(event: string, handler: (payload: unknown) => void): () => void;

  surface(view: () => unknown): void;
  say(message: string): void;
  complain(message: string): void;
  sayOnce(slot: string, message: string): void;
  working(text: string): (done: string, failed?: boolean) => void;
}

export type PluginClass<T = unknown> = new (ide: Ide) => T;

export interface RegistrySpec {
  key: string;
  schema?: object;
  persist?: 'memory';
}

export interface RegistryHandle<T> {
  add(value: T): () => void;
  readonly all: { readonly value: T[] };
}

export function registry(spec: RegistrySpec) {
  return function (target: object, ctx: ClassDecoratorContext): void {
    void ctx;
    const list = declared.get(target) ?? [];
    list.push(spec);
    declared.set(target, list);
  };
}

const declared = new WeakMap<object, RegistrySpec[]>();

export function registriesOf(ctor: object): RegistrySpec[] {
  return declared.get(ctor) ?? [];
}

export interface SettingsSection {
  section: string;
  defaults: object;
}

export function configSection(spec: SettingsSection) {
  return function (target: object, ctx: ClassDecoratorContext): void {
    void ctx;
    const list = sections.get(target) ?? [];
    list.push(spec);
    sections.set(target, list);
  };
}

const sections = new WeakMap<object, SettingsSection[]>();

export function sectionsOf(ctor: object): SettingsSection[] {
  return sections.get(ctor) ?? [];
}

export const SETTINGS_SCHEMA = {
  type: 'object',
  required: ['section', 'defaults'],
  additionalProperties: false,
  properties: { section: { type: 'string' }, defaults: { type: 'object' } },
} as const;

export function activate() {
  return function (method: () => unknown, ctx: ClassMethodDecoratorContext): void {
    void ctx;
    ctx.addInitializer(function (this: unknown) {
      const target = this as object;
      hooks.set(target, { ...hooks.get(target), start: method.bind(target) });
    });
  };
}

export function remote(name?: string) {
  return function <This extends object, Args extends unknown[], R>(
    method: (this: This, ...args: Args) => R,
    ctx: ClassMethodDecoratorContext,
  ): (this: This, ...args: Args) => R {
    void method;
    return function (this: This, ...args: Args): R {
      return ideOf(this).rpc.call(name ?? String(ctx.name), args[0]) as R;
    };
  };
}

export function stub(): never {
  throw new Error('метод не подменён: забыт декоратор @remote?');
}

interface Hooks {
  start?: () => unknown;
}

const hooks = new WeakMap<object, Hooks>();
const services = new WeakMap<object, Ide>();

export function attach(instance: object, ide: Ide): void {
  services.set(instance, ide);
}

export function hooksOf(instance: object): Hooks {
  return hooks.get(instance) ?? {};
}

function ideOf(instance: object): Ide {
  const found = services.get(instance);
  if (!found) {
    throw new Error('плагин создан мимо плагинной системы: службы не прикреплены');
  }
  return found;
}
