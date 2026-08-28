
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

export interface Found {
  label: string;
  path?: string;
  line?: number;
  detail?: string;
  id?: string;
}

export interface FindProvider {
  kind: string;
  wants(path: string): boolean;
  finds(path: string, text: string): Found[];
}

export interface Ide {
  readonly name: string;
  method(name: string, handler: CommandHandler): void;
  getPlugin<T>(ctor: PluginClass<T>): T;
  find(provider: FindProvider): void;
  readonly log: Logger;
}

export type PluginClass<T = unknown> = new (ide: Ide) => T;

export function command(name?: string) {
  return function (method: CommandHandler, ctx: ClassMethodDecoratorContext): void {
    ctx.addInitializer(function (this: unknown) {
      const target = this as object;
      const now = declared.get(target) ?? new Map<string, CommandHandler>();
      now.set(name ?? String(ctx.name), method.bind(target));
      declared.set(target, now);
    });
  };
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

interface Hooks {
  start?: () => unknown;
}

const declared = new WeakMap<object, Map<string, CommandHandler>>();
const hooks = new WeakMap<object, Hooks>();

export function declaredOf(instance: object): Map<string, CommandHandler> {
  return declared.get(instance) ?? new Map();
}

export function hooksOf(instance: object): Hooks {
  return hooks.get(instance) ?? {};
}
