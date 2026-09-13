import { createContext, createElement, type ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import type { Signal } from '@preact/signals';
import type {
  DirEntry,
  DocState,
  DocVersion,
  EntryKind,
  Settings,
  WorkspaceInfo,
  SettingScope,
  SettingValue,
} from '@mosetta/ide-protocol';

export interface Size {
  w: number;
  h: number;
}

export interface ResizerProps {
  id: string;
  side: 'left' | 'right';
  axis?: 'x' | 'y';
  limits: () => { min: number; max: number };
  defaultWidth: number;
}

export type { DirEntry, EntryKind } from '@mosetta/ide-protocol';

export interface TreeWire {
  list(path: string): Promise<DirEntry[]>;
  onChanged(handler: (event: { path: string }) => void): () => void;
}

export interface FsAccess {
  create(path: string, kind: EntryKind): Promise<DirEntry>;
  move(from: string, to: string): Promise<DirEntry>;
  copy(from: string, to: string): Promise<DirEntry>;
  remove(path: string): Promise<void>;
  write(path: string, text: string): Promise<void>;
  writeBytes(path: string, base64: string): Promise<DirEntry>;
  absolute(path: string): Promise<string>;
}

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

export interface WorkspacesAccess {
  readonly current: { readonly value: WorkspaceInfo | null };
  readonly live: { readonly value: WorkspaceInfo[] };
  open(root: string): Promise<void>;
  switchTo(id: string): Promise<void>;
}

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

export interface HunkBox {
  left: number;
  top: number;
  bottom: number;
}

export interface IdeServices {
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  readonly runCommand: (id: string) => boolean;
  readonly knownCommands: { readonly value: ReadonlyArray<{ id: string; about: string }> };
  readonly settings: { readonly value: Settings | null };
  readonly settingsOf: <T extends object>(section: string, defaults: T) => { readonly value: T };
  readonly project: { readonly value: WorkspaceInfo | null };
  readonly tree: TreeWire;
  readonly fs: FsAccess;
  readonly docs: DocWire;
  readonly setSetting: (
    section: string,
    key: string,
    value: SettingValue,
    scope?: SettingScope,
  ) => Promise<void>;
  readonly workspaces: WorkspacesAccess;

  readonly connected: { readonly value: boolean };
  readonly notes: NotesAccess;
  readonly projectPath: { readonly value: string | null };
  readonly resetSetting: (section: string, key: string) => Promise<void>;
  readonly mount: Mount;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Mount {
  readonly size: { readonly value: { w: number; h: number } };
  bounds(): Bounds;
  local(x: number, y: number): { x: number; y: number };
  idle(el: Element | null): boolean;
  listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: { capture?: boolean },
  ): () => void;
  title(text: string): void;
}

const IdeContext = createContext<IdeServices | null>(null);

export function IdeProvider(props: { value: IdeServices; children?: ComponentChildren }) {
  return createElement(IdeContext.Provider, { value: props.value }, props.children);
}

export function useIde(): IdeServices {
  const ide = useContext(IdeContext);
  if (!ide) throw new Error('службы IDE не найдены: корень разметки не обёрнут в IdeProvider');
  return ide;
}

export function useT(): IdeServices['t'] {
  return useIde().t;
}

export interface PluginToolbarEntry {
  id: string;
  title: string;
  icon: string | ((filled: boolean) => unknown);
  command: string;
  active?: { readonly value: boolean };
}

export interface Ide extends IdeServices {
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
  readonly entries: { readonly value: Array<{ by: string; value: T }> };
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

export interface SettingField {
  options?: readonly string[];
}

export interface SettingsSection {
  section: string;
  defaults: object;
  fields?: Record<string, SettingField>;
  editor?: () => unknown;
  schema?: object;
}

export function settingsKey(section: string): string {
  return `settings.${section}`;
}

export const USER_LAYER = 'settings.json';
export const PROJECT_LAYER = '.mosetta/settings.json';

export function inLayerOrder<T>(entries: ReadonlyArray<{ by: string; value: T }>): Array<{ by: string; value: T }> {
  const rank = (by: string): number => (by === USER_LAYER ? 1 : by === PROJECT_LAYER ? 2 : 0);
  return [...entries].sort((a, b) => rank(a.by) - rank(b.by));
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

export interface SettingsEntry extends SettingsSection {
  owner: string;
  title: string;
}

export interface PluginSpec {
  title: string;
}

export function plugin(spec: PluginSpec) {
  return function (target: object, ctx: ClassDecoratorContext): void {
    void ctx;
    passports.set(target, spec);
  };
}

const passports = new WeakMap<object, PluginSpec>();

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

export function registriesOf(ctor: object): RegistrySpec[] {
  return declared.get(ctor) ?? [];
}
export function passportOf(ctor: object): PluginSpec | null {
  return passports.get(ctor) ?? null;
}
export function sectionsOf(ctor: object): SettingsSection[] {
  return sections.get(ctor) ?? [];
}
export const SETTINGS_SCHEMA = {
  type: 'object',
  required: ['section', 'defaults', 'owner', 'title'],
  additionalProperties: false,
  properties: {
    section: { type: 'string' },
    defaults: { type: 'object' },
    fields: { type: 'object' },
    schema: { type: 'object' },
    editor: {},
    owner: { type: 'string' },
    title: { type: 'string' },
  },
} as const;

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
