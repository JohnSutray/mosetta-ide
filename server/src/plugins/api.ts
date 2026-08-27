import type { Logger } from '../log.js';

export interface CallContext {
  services: unknown;
}

export type CommandHandler = (params: unknown, call: CallContext) => unknown;

export interface ServerPluginServices {
  readonly name: string;
  method(name: string, handler: CommandHandler): void;
  getPlugin<T>(ctor: new () => T): T;
  log: Logger;
}

export interface Declared {
  name: string;
  method: CommandHandler;
}

export abstract class Plugin implements ServerPluginServices {
  declare readonly name: string;
  declare readonly method: ServerPluginServices['method'];
  declare readonly getPlugin: ServerPluginServices['getPlugin'];
  declare readonly log: Logger;
  declare readonly __declared?: Declared[];

  activate(): void | Promise<void> {}
  deactivate(): void {}
}

export function command(name?: string) {
  return function (method: any, ctx: ClassMethodDecoratorContext): void {
    ctx.addInitializer(function (this: any) {
      const list: Declared[] = (this.__declared ??= []);
      list.push({ name: name ?? String(ctx.name), method: method.bind(this) });
    });
  };
}
