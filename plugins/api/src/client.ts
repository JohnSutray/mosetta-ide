import type { ComponentChildren, JSX } from 'preact';
import type { TerminalInfo } from '@ide/protocol';

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

export interface ClientSurface {
  PickPopup: typeof PickPopup;
  highlight: typeof highlight;
  shiftMatches: typeof shiftMatches;
  showTerminal: typeof showTerminal;
}

export interface PluginToolbarEntry {
  id: string;
  title: string;
  icon: string;
  command: string;
  active?: { readonly value: boolean };
}

export interface Found {
  path: string;
  id?: string;
}

export interface PluginServices {
  readonly name: string;
  readonly rpc: { call(method: string, params?: unknown): Promise<unknown> };
  getPlugin<T>(ctor: new () => T): T;
  command(id: string, title: string, run: () => void): void;
  toolbar(entry: PluginToolbarEntry): void;
  surface(view: () => unknown): void;
  open(kind: string, handler: (found: Found) => void): void;
  say(message: string): void;
}

export abstract class Plugin implements PluginServices {
  declare readonly name: string;
  declare readonly rpc: PluginServices['rpc'];
  declare readonly getPlugin: PluginServices['getPlugin'];
  declare readonly command: PluginServices['command'];
  declare readonly toolbar: PluginServices['toolbar'];
  declare readonly surface: PluginServices['surface'];
  declare readonly open: PluginServices['open'];
  declare readonly say: PluginServices['say'];

  activate(): void | Promise<void> {}

  deactivate(): void {}
}

export function remote(name?: string) {
  return function <This extends PluginServices, Args extends unknown[], R>(
    method: (this: This, ...args: Args) => R,
    ctx: ClassMethodDecoratorContext,
  ): (this: This, ...args: Args) => R {
    void method;
    return function (this: This, ...args: Args): R {
      return this.rpc.call(name ?? String(ctx.name), args[0]) as R;
    };
  };
}

export function stub(): never {
  throw new Error('метод не подменён: забыт декоратор @remote?');
}
