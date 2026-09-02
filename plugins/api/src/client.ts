import type { Signal } from '@preact/signals';
import type { Diagnostic, DocState, HoverInfo, Settings } from '@ide/protocol';

export interface Size {
  w: number;
  h: number;
}

export declare function t(key: string, params?: Record<string, string | number>): string;

export interface FileProblems {
  path: string;
  diagnostics: Diagnostic[];
}

export declare const problems: { readonly value: FileProblems[] };

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

export declare const openDoc: { readonly value: DocState | null };

export declare function editDoc(text: string): void;

export declare function closeFile(): Promise<void>;

export declare const dirty: { readonly value: boolean };

export declare const fileDiagnostics: { readonly value: Diagnostic[] };

export declare const externalEpoch: { readonly value: number };

export interface Reveal {
  path: string;
  line: number;
  character?: number;
  epoch: number;
}
export declare const pendingReveal: { readonly value: Reveal | null };

export declare function headFor(path: string | null): string | null;

export declare function visit(path: string, line: number, character: number): void;

export type HunkKind = 'added' | 'modified' | 'removed';
export interface Hunk {
  kind: HunkKind;
  from: number;
  to: number;
  before: string[];
}
export interface HunkBox {
  left: number;
  top: number;
  bottom: number;
}

export declare function unstable_diffLines(before: string, after: string): Hunk[];

export declare function unstable_showHunk(hunk: Hunk, box: HunkBox): void;

export interface SymbolAsk {
  line: number;
  character: number;
  text: string;
  box: { x: number; y: number };
}

export declare function unstable_askSymbol(where: SymbolAsk): Promise<void>;

export declare function hover(
  path: string,
  line: number,
  character: number,
): Promise<HoverInfo | null>;

export declare function takeFocusOnMount(): boolean;

export declare const wantsFocus: { readonly value: number };

export declare function chordHeld(
  command: string,
  event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
): boolean;

export declare const unstable_darcula: unknown;

export declare function unstable_textStyle(settings: {
  fontFamily: string;
  ligatures: boolean;
}): Record<string, string>;

export interface Palette {
  fg: string;
  bg: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  doc: string;
  todo: string;
  parenBg: string;
  parenFg: string;
  treeBg: string;
  iconDir: string;
  const: string;
  class: string;
  func: string;
  annot: string;
  curline: string;
  selection: string;
  treesel: string;
  caret: string;
  divider: string;
  gutterBg: string;
  gutterFg: string;
  gutterHl: string;
  errorFg: string;
  warnFg: string;
  tooltipBg: string;
}
export declare const unstable_dc: Palette;

export interface CodeChunk {
  text: string;
  color: string | null;
}

export declare function unstable_paintCode(text: string, path: string): CodeChunk[];

export declare function unstable_languageFor(path: string): unknown;

export declare const unstable_inputKeymap: readonly unknown[];

export interface ClientSurface {
  t: typeof t;
  problems: typeof problems;
  goTo: typeof goTo;
  runCommand: typeof runCommand;
  keysFor: typeof keysFor;
  settings: typeof settings;
  openDoc: typeof openDoc;
  editDoc: typeof editDoc;
  closeFile: typeof closeFile;
  dirty: typeof dirty;
  fileDiagnostics: typeof fileDiagnostics;
  externalEpoch: typeof externalEpoch;
  pendingReveal: typeof pendingReveal;
  headFor: typeof headFor;
  visit: typeof visit;
  unstable_diffLines: typeof unstable_diffLines;
  unstable_showHunk: typeof unstable_showHunk;
  unstable_askSymbol: typeof unstable_askSymbol;
  hover: typeof hover;
  takeFocusOnMount: typeof takeFocusOnMount;
  wantsFocus: typeof wantsFocus;
  chordHeld: typeof chordHeld;
  unstable_darcula: typeof unstable_darcula;
  unstable_textStyle: typeof unstable_textStyle;
  unstable_dc: typeof unstable_dc;
  unstable_paintCode: typeof unstable_paintCode;
  unstable_languageFor: typeof unstable_languageFor;
  unstable_inputKeymap: typeof unstable_inputKeymap;
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
