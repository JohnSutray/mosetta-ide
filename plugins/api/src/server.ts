
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface ProjectResource {
  dispose(): void | Promise<void>;
}

export interface Project {
  readonly root: string;
  readonly name: string;

  use<T extends ProjectResource>(key: string, create: () => T): T;

  emit(event: string, payload: unknown): void;

  hold(reason: string): () => void;

  resolve(relative: string): string;

  spawned(
    info: { pid: number | undefined; command: string; reason: string },
    kill: () => void,
  ): () => void;
}

export interface RunAsk {
  command: string;
  args: string[];
  cwd?: string;
  reason: string;
  wants?: Array<'no-prompts' | 'machine-readable' | 'user-shell'>;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxBuffer?: number;
}

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  truncated: boolean;
}

export interface ShellChoice {
  file: string;
  args: string[];
  env: Record<string, string>;
  problem?: string;
}

export interface CallContext {
  project: Project;
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
  shell(): ShellChoice;
  run(ask: RunAsk): Promise<RunResult>;
  stream(ask: RunAsk, onChunk: (text: string) => void): Promise<RunResult>;
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
