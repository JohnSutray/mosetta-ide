

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface ProjectResource {
  dispose(): void | Promise<void>;
}

export interface MemoryDoc {
  path: string;
  text: string;
  version: number;
  openCount: number;
  savedText?: string;
}

export type MemoryEvent =
  | {
      type:
        | 'doc.resident'
        | 'doc.opened'
        | 'doc.changed'
        | 'doc.saved'
        | 'doc.external'
        | 'doc.closed'
        | 'doc.removed'
        | 'doc.saveBlocked';
      path: string;
    }
  | { type: 'doc.moved'; path: string; from: string }
  | { type: 'tree.changed'; path: string };

export interface ProjectMemory {
  on(listener: (event: MemoryEvent) => void): () => void;
  files(): Iterable<{ path: string }>;
  docSync(path: string): MemoryDoc | null;
  peekDoc(path: string): Promise<MemoryDoc>;
  isTextual(path: string): boolean;
  disk(path: string): Promise<{ text: string; revision: string } | null>;
  settle(path: string, text: string | null): Promise<void>;
  adopt(path: string, text: string | null): Promise<void>;
}

export interface ProcessStream {
  on(event: 'data', handler: (chunk: Uint8Array) => void): unknown;
}

export interface ProcessChild {
  readonly stdin: { readonly writable: boolean; write(data: Uint8Array | string): boolean; end(): void };
  readonly stdout: ProcessStream;
  readonly stderr: ProcessStream;
  on(event: 'error', handler: (err: Error) => void): unknown;
  on(event: 'exit', handler: (code: number | null, signal: string | null) => void): unknown;
}

export interface ProcessHandle {
  readonly child: ProcessChild;
  kill(signal?: string): void;
  memoryMb(): Promise<number | null>;
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

  start(ask: RunAsk): ProcessHandle;

  readonly memory: ProjectMemory;
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

export interface CallContext {
  project: Project;
  services: unknown;
}

export type CommandHandler = (params: unknown, call: CallContext) => unknown;

export interface Ide {
  readonly name: string;
  method(name: string, handler: CommandHandler): void;
  getPlugin<T>(ctor: PluginClass<T>): T;
  onProject(handler: (project: Project) => void): void;
  settings<T extends object>(section: string, defaults: T): T;
  environment(): Record<string, string>;
  which(name: string): string | null;
  run(ask: RunAsk): Promise<RunResult>;
  stream(ask: RunAsk, onChunk: (text: string) => void): Promise<RunResult>;
  readonly log: Logger;
  readonly dir: string;
  readonly state: string;
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
