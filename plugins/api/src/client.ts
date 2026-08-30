import type { ComponentChildren, JSX } from 'preact';
import type { Signal } from '@preact/signals';
import type { Diagnostic, DocState, HoverInfo, Settings, TerminalInfo } from '@ide/protocol';

export interface Size {
  w: number;
  h: number;
}

export interface PickItem<T> {
  key: string;
  text: string;
  value: T;
}

export interface PickProps<T> {
  id: string;
  title: string;
  meta?: ComponentChildren;
  items: Array<PickItem<T>>;
  placeholder: string;
  empty: string;
  size: Size;
  min: Size;
  onClose: () => void;
  onPick: (value: T) => void;
  row: (value: T, matches: number[], picked: boolean) => JSX.Element;
  section?: (value: T) => string;
  footer?: ComponentChildren;
  extra?: ComponentChildren;
  onMouseDown?: (event: MouseEvent) => void;
}

export declare function PickPopup<T>(props: PickProps<T>): JSX.Element;

export declare function highlight(text: string, matches: number[]): ComponentChildren;

export declare function shiftMatches(matches: number[], from: number, length: number): number[];

export declare function showTerminal(open: () => Promise<TerminalInfo>): Promise<void>;

export declare function t(key: string, params?: Record<string, string | number>): string;

export interface FileProblems {
  path: string;
  diagnostics: Diagnostic[];
}

export declare const problems: { readonly value: FileProblems[] };

export declare const openPath: { readonly value: string | null };

export declare function goTo(path: string, line: number, character?: number): Promise<void>;

export declare function runCommand(id: string): boolean;

export declare function showTip(near: Element, text: string, keys?: string[]): void;
export declare function hideTip(): void;

export declare function keysFor(command: string): string[];

export interface ResizerProps {
  id: string;
  side: 'left' | 'right';
  axis?: 'x' | 'y';
  limits: () => { min: number; max: number };
  defaultWidth: number;
}
export declare function Resizer(props: ResizerProps): JSX.Element;

export declare function widthOf(id: string, fallback: number): number;

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

export declare function diffLines(before: string, after: string): Hunk[];

export declare function showHunk(hunk: Hunk, box: HunkBox): void;

export interface SymbolAsk {
  line: number;
  character: number;
  text: string;
  box: { x: number; y: number };
}

export declare function askSymbol(where: SymbolAsk): Promise<void>;

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

export declare const darcula: unknown;

export declare function textStyle(settings: {
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
export declare const dc: Palette;

export interface CodeChunk {
  text: string;
  color: string | null;
}

export declare function paintCode(text: string, path: string): CodeChunk[];

export declare function languageFor(path: string): unknown;

export declare const inputKeymap: readonly unknown[];

export interface ClientSurface {
  PickPopup: typeof PickPopup;
  highlight: typeof highlight;
  shiftMatches: typeof shiftMatches;
  showTerminal: typeof showTerminal;
  t: typeof t;
  problems: typeof problems;
  openPath: typeof openPath;
  goTo: typeof goTo;
  runCommand: typeof runCommand;
  showTip: typeof showTip;
  hideTip: typeof hideTip;
  keysFor: typeof keysFor;
  settings: typeof settings;
  Resizer: typeof Resizer;
  widthOf: typeof widthOf;
  openDoc: typeof openDoc;
  editDoc: typeof editDoc;
  closeFile: typeof closeFile;
  dirty: typeof dirty;
  fileDiagnostics: typeof fileDiagnostics;
  externalEpoch: typeof externalEpoch;
  pendingReveal: typeof pendingReveal;
  headFor: typeof headFor;
  visit: typeof visit;
  diffLines: typeof diffLines;
  showHunk: typeof showHunk;
  askSymbol: typeof askSymbol;
  hover: typeof hover;
  takeFocusOnMount: typeof takeFocusOnMount;
  wantsFocus: typeof wantsFocus;
  chordHeld: typeof chordHeld;
  darcula: typeof darcula;
  textStyle: typeof textStyle;
  dc: typeof dc;
  paintCode: typeof paintCode;
  languageFor: typeof languageFor;
  inputKeymap: typeof inputKeymap;
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
