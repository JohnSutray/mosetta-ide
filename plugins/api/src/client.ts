import type { Signal } from '@preact/signals';
import type {
  DirEntry,
  DocState,
  EntryKind,
  IndexHit,
  KeyBinding,
  KeyContext,
  KeyHost,
  KeyOs,
  KeyScope,
  IndexKind,
  MergeSession,
  Settings,
  WorkspaceInfo,
} from '@ide/protocol';

export interface Size {
  w: number;
  h: number;
}

export declare function t(key: string, params?: Record<string, string | number>): string;

export declare function goTo(path: string, line: number, character?: number): Promise<void>;

export declare function runCommand(id: string): boolean;

export declare function keysFor(command: string): string[];

export interface ResizerProps {
  id: string;
  side: 'left' | 'right';
  axis?: 'x' | 'y';
  limits: () => { min: number; max: number };
  defaultWidth: number;
}

export declare const settings: { readonly value: Settings | null };

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

export declare function openFile(path: string, options?: { focus?: boolean }): Promise<void>;
export declare function flushDocs(): Promise<void>;
export declare function setSetting(section: string, key: string, value: string | boolean): Promise<void>;
export declare function primaryHeld(event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean;

export interface MergeAccess {
  state(): Promise<MergeSession | null>;
  resolve(path: string, text: string | null): Promise<MergeSession | null>;
  cancel(): Promise<void>;
  fromDisk(path: string): Promise<MergeSession | null>;
  onState(handler: (state: MergeSession | null) => void): () => void;
  onRequested(handler: (path: string) => void): () => void;
  expectExternal(path: string): void;
  forgetDiverged(path: string): void;
}
export declare const merge: MergeAccess;

export interface WorkspacesAccess {
  readonly current: { readonly value: WorkspaceInfo | null };
  readonly live: { readonly value: WorkspaceInfo[] };
  open(root: string): Promise<void>;
  switchTo(id: string): Promise<void>;
}
export declare const workspaces: WorkspacesAccess;

export interface KeyEcho {
  key: string;
  context: KeyContext;
  command: string | null;
  seq: number;
}
export interface TakenKey {
  key: string;
  scopes: KeyScope[];
  who: string;
  what: string;
  soft?: boolean;
}
export interface KeysAccess {
  readonly host: KeyHost;
  readonly os: KeyOs;
  readonly bindings: { readonly value: KeyBinding[] };
  humanize(key: string): string;
  taken(scopes: KeyScope[]): TakenKey[];
  readonly echo: { readonly value: KeyEcho | null };
}
export declare const keys: KeysAccess;

export declare const diverged: { readonly value: ReadonlyMap<string, 'changed' | 'removed'> };
export declare function reloadFile(): Promise<void>;

export declare const openDoc: { readonly value: DocState | null };

export declare function editDoc(text: string): void;

export declare function closeFile(): Promise<void>;

export declare const dirty: { readonly value: boolean };

export declare const externalEpoch: { readonly value: number };

export interface Reveal {
  path: string;
  line: number;
  character?: number;
  epoch: number;
}
export declare const pendingReveal: { readonly value: Reveal | null };

export type { Hunk, HunkKind } from '@ide/code';

export interface HunkBox {
  left: number;
  top: number;
  bottom: number;
}

export declare function peekFile(path: string): Promise<{ path: string; text: string }>;

export declare function searchIndex(query: string, limit?: number, kinds?: IndexKind[]): Promise<IndexHit[]>;

export declare function openerFor(kind: string): ((found: Found) => void) | undefined;

export declare function takeFocusOnMount(): boolean;

export declare const wantsFocus: { readonly value: number };

export declare function chordHeld(
  command: string,
  event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
): boolean;

export interface ClientSurface {
  t: typeof t;
  goTo: typeof goTo;
  runCommand: typeof runCommand;
  keysFor: typeof keysFor;
  settings: typeof settings;
  project: typeof project;
  tree: typeof tree;
  fs: typeof fs;
  openFile: typeof openFile;
  flushDocs: typeof flushDocs;
  setSetting: typeof setSetting;
  primaryHeld: typeof primaryHeld;
  merge: typeof merge;
  workspaces: typeof workspaces;
  keys: typeof keys;
  diverged: typeof diverged;
  reloadFile: typeof reloadFile;
  openDoc: typeof openDoc;
  editDoc: typeof editDoc;
  closeFile: typeof closeFile;
  dirty: typeof dirty;
  externalEpoch: typeof externalEpoch;
  pendingReveal: typeof pendingReveal;
  peekFile: typeof peekFile;
  searchIndex: typeof searchIndex;
  openerFor: typeof openerFor;
  takeFocusOnMount: typeof takeFocusOnMount;
  wantsFocus: typeof wantsFocus;
  chordHeld: typeof chordHeld;
}

export interface PluginToolbarEntry {
  id: string;
  title: string;
  icon: string | ((filled: boolean) => unknown);
  command: string;
  active?: { readonly value: boolean };
}

export interface Found {
  path: string;
  id?: string;
}

export interface Ide {
  readonly name: string;
  readonly rpc: { call(method: string, params?: unknown): Promise<unknown> };
  getPlugin<T>(ctor: PluginClass<T>): T;
  command(id: string, run: () => void): void;
  registry<T>(key: string): RegistryHandle<T>;
  remember<T>(key: string, initial: T): Signal<T>;
  css(text: string): void;
  on(event: string, handler: (payload: unknown) => void): () => void;

  surface(view: () => unknown): void;
  open(kind: string, handler: (found: Found) => void): void;
  say(message: string): void;
  complain(message: string): void;
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
