
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

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
  return function (method: CommandHandler, ctx: ClassMethodDecoratorContext): void {
    ctx.addInitializer(function (this: unknown) {
      const target = this as { __declared?: Declared[] };
      const list: Declared[] = (target.__declared ??= []);
      list.push({ name: name ?? String(ctx.name), method: method.bind(target) });
    });
  };
}
