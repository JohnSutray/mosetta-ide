import type { ReadonlySignal } from '@preact/signals';

export interface PluginToolbarEntry {
  id: string;
  title: string;
  icon: string;
  command: string;
  active?: ReadonlySignal<boolean>;
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
  return function (method: any, ctx: ClassMethodDecoratorContext): any {
    void method;
    return function (this: PluginServices, params?: unknown) {
      return this.rpc.call(name ?? String(ctx.name), params);
    };
  };
}

export function stub(): never {
  throw new Error('метод не подменён: забыт декоратор @remote?');
}
