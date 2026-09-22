import { declareMethod, setHook } from './server-host.js';

/** Where a plugin writes. The application hands over its own logger — wider, but it fits. */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * A project subsystem: it has to know how to die.
 *
 * A mirror of the core's own workspace resource. Under its own name because
 * this is a contract: the core's type will one day grow something of its own,
 * while a plugin's keeps exactly what it was promised.
 */
export interface ProjectResource {
  dispose(): void | Promise<void>;
}

/** A document in memory — exactly what a derived layer needs. */
export interface MemoryDoc {
  path: string;
  text: string;
  /** The edit counter IN MEMORY. It rises on every edit and has nothing to do with disk. */
  version: number;
  /** How many times the document was opened explicitly, by an editor. */
  openCount: number;
  /**
   * The text as it lies on disk, while the document is dirty. This is the
   * ANCESTOR for a three-way argument: without it, edits at opposite ends of a
   * file would look like a conflict.
   */
  savedText?: string;
}

/**
 * What happens in the memory layer. A subset of the RAM filesystem's events:
 * the ones derived layers stand on. Arguing with disk and the watcher are not
 * among them — that is a conversation between memory and the editor.
 */
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
        /** The save did not happen: disk moved ahead. THIS is a conflict. */
        | 'doc.saveBlocked';
      path: string;
    }
  | { type: 'doc.moved'; path: string; from: string }
  | { type: 'tree.changed'; path: string };

/**
 * The project's memory layer, LENT to a derived layer.
 *
 * This is the core's fundamental offering: a language server and an index stand
 * on memory rather than on disk, and there was a time when only core code could
 * stand on it. Reading is allowed, writing is not: the truth belongs to the
 * editor.
 */
export interface ProjectMemory {
  on(listener: (event: MemoryEvent) => void): () => void;
  /** Every known file of the project, without contents. */
  files(): Iterable<{ path: string }>;
  /** Synchronously — if the file is in memory already. */
  docSync(path: string): MemoryDoc | null;
  /** Pull into memory WITHOUT counting it as an open. */
  peekDoc(path: string): Promise<MemoryDoc>;
  /**
   * Whether memory considers this file textual. The answer comes from the
   * CONTENTS: "no" means "we read it and saw a binary", and about something
   * unread we answer "yes" — not seen is not sentenced.
   */
  isTextual(path: string): boolean;
  /**
   * What lies on disk RIGHT NOW; `null` means the file is not there. An event
   * only says "look here"; the truth comes from reading at the moment of the
   * argument.
   */
  disk(path: string): Promise<{ text: string; revision: string } | null>;
  /**
   * The verdict, ONTO DISK: the assembled text becomes both memory and disk.
   *
   * One of the two verbs that end an argument between memory and disk, and the
   * only thing a plugin writes into memory. Not an edit — editing is the
   * editor's job through `doc.edit`. This is a judge's decision, and the judge
   * is the merge plugin. `null` means the user accepted the deletion.
   */
  settle(path: string, text: string | null): Promise<void>;
  /** The verdict, INTO MEMORY: disk is left alone and the document stays as dirty as it diverged. */
  adopt(path: string, text: string | null): Promise<void>;
}

/** A subprocess pipe: exactly enough to read frames. */
export interface ProcessStream {
  on(event: 'data', handler: (chunk: Uint8Array) => void): unknown;
}

/**
 * A subprocess described structurally, without Node's types: the contract lives
 * in a package the client reads too. A real `ChildProcess` fits this as it is.
 */
export interface ProcessChild {
  /** The pid: it is what a process TREE is killed by. */
  readonly pid?: number | undefined;
  readonly stdin: { readonly writable: boolean; write(data: Uint8Array | string): boolean; end(): void };
  readonly stdout: ProcessStream;
  readonly stderr: ProcessStream;
  on(event: 'error', handler: (err: Error) => void): unknown;
  on(event: 'exit', handler: (code: number | null, signal: string | null) => void): unknown;
}

/** A long-lived subprocess with pipes: a language server, for instance. */
export interface ProcessHandle {
  readonly child: ProcessChild;
  kill(signal?: string): void;
  /**
   * How much memory the process AND ALL ITS DESCENDANTS hold, in megabytes;
   * `null` when this system cannot be measured.
   *
   * The tree specifically: `typescript-language-server` holds some fifty
   * megabytes while the gigabyte sits in the `tsserver.js` it started itself.
   * Asking about one child would have measured an untruth.
   */
  memoryMb(): Promise<number | null>;
}

/**
 * THE PROJECT, as handed to a plugin.
 *
 * Before this, a plugin got `services: unknown` — the core's innards with a
 * cast. A cast inevitably comes back: the next plugin repeats it, then a third,
 * and the "contract" turns out to be that nobody renamed a field. Here, exactly
 * what is promised is named.
 *
 * The shape was chosen for terminals, the first plugin for which "ask and
 * answer" was not enough. They need all three: a pty lives as long as the
 * project (`use`), prints of its own accord (`emit`) and has to survive the
 * panel closing (`hold`).
 */
export interface Project {
  /** The root on disk. Protocol paths are relative to it. */
  readonly root: string;
  /** The project's name — what a human sees in the title. */
  readonly name: string;

  /**
   * A resource living as long as the project. A second call with the same key
   * returns the first one, so missing someone else's project is impossible.
   *
   * Keys are partitioned per plugin, as memory is on the client: two plugins are
   * entitled to call theirs `terminals` and must not silently share it.
   */
  use<T extends ProjectResource>(key: string, create: () => T): T;

  /**
   * Tell EVERY tab of this project. The event is the plugin's own: the core
   * carries it in an envelope and does not look inside.
   */
  emit(event: string, payload: unknown): void;

  /**
   * Keep the project warm while this is alive.
   *
   * A project dies when nobody is looking at it and the idle timeout has passed.
   * For a terminal that is not enough: it has to survive both the panel closing
   * and the tab reloading. Returns a release.
   */
  hold(reason: string): () => void;

  /**
   * THIS project's settings: over the machine's, the layer from
   * `<root>/.mosetta/settings.json`. A function rather than a value, like
   * `ide.settings`: an edit to either file takes effect without a restart.
   * Everything that depends on the project — a sweep ceiling, a memory budget, a
   * hit count, a package manager — is asked here; `ide.settings` has no project
   * layer at all.
   */
  settings<T extends object>(section: string, defaults: T): T;

  /**
   * A protocol path to an absolute one, checking that it does not escape the
   * root.
   *
   * A plugin must not do this by hand: the "is it inside" check belongs in one
   * place, otherwise a `../../..` in somebody's parameter will one day land in
   * somebody's directory. Throws if the path leads outside.
   */
  resolve(relative: string): string;

  /**
   * Register your own subprocess in the shared ledger.
   *
   * Needed by whoever spawns a process themselves rather than through the core —
   * a pseudo-terminal, for example, since a pty is a device rather than a pipe.
   * The ledger keeps telling the truth, and closing the project can see what is
   * still alive. It will not kill from there: `kill` is called only if the owner
   * failed to clean up. Returns a forget.
   */
  spawned(
    info: { pid: number | undefined; command: string; reason: string },
    kill: () => void,
  ): () => void;

  /**
   * Start a long-lived subprocess belonging to THIS project: pipes exposed, in
   * the shared ledger, dying with the project. For whoever talks to a process
   * rather than waits for it.
   */
  start(ask: RunAsk): ProcessHandle;

  /** The project's memory layer — read only. */
  readonly memory: ProjectMemory;
}

/**
 * What to run, and why.
 *
 * `reason` is not decoration: it travels into the journal and into the ledger of
 * live subprocesses, and one day it is how a human works out which `git fetch`
 * has been hanging for forty seconds.
 */
export interface RunAsk {
  command: string;
  args: string[];
  /** The working directory. Without it, the server's own. */
  cwd?: string;
  reason: string;
  /**
   * Intentions about the environment. `user-shell` means the HUMAN's variables
   * rather than ours; `no-prompts` means do not ask for a password where there
   * is nobody to ask; `machine-readable` means English output, for parsing.
   */
  wants?: Array<'no-prompts' | 'machine-readable' | 'user-shell'>;
  env?: Record<string, string>;
  timeoutMs?: number;
  /** How much output will fit. Silent truncation is the worst kind of error. */
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
  /** The session's project AT THE MOMENT OF THE CALL. Throws if there is none. */
  project: Project;
  /**
   * The core's innards disguised as `unknown` — a debt, not a contract.
   *
   * Through them plugins currently reach the find index and open terminals,
   * casting the type on their own side. It leaves along with whoever calls it.
   */
  services: unknown;
}

export type CommandHandler = (params: unknown, call: CallContext) => unknown;

/** Everything the IDE can do for a server half. Arrives through the constructor. */
export interface Ide {
  readonly name: string;
  /** Declare a method by hand. Usually one writes `@command` instead. */
  method(name: string, handler: CommandHandler): void;
  /** Another plugin by its class: the key and the type are one object. */
  getPlugin<T>(ctor: PluginClass<T>): T;
  /**
   * The project opened and its layers came up. For whoever has to live with the
   * project from the first second — a language server — rather than wait for the
   * first call. The resource is set up with `project.use`, and it dies with the
   * project.
   */
  onProject(handler: (project: Project) => void): void;
  /**
   * Your own settings section over your own defaults. A function rather than a
   * value: an edit to the settings file takes effect without a restart, so a
   * plugin is obliged to ask at the moment it acts. The defaults are the
   * plugin's code, the core knows nothing about its section, and a key of the
   * wrong type in the file falls back to its default. This is the MACHINE layer
   * — whatever does not depend on the project (a shell, a font); with a project
   * in hand one asks `project.settings`, which has the project's own file on top.
   */
  settings<T extends object>(section: string, defaults: T): T;
  /**
   * The user's environment: their shell's variables rather than our process's.
   * Empty until the shell has answered. Needed by whoever spawns a process past
   * `run` — a pseudo-terminal, for example.
   */
  environment(): Record<string, string>;
  /**
   * Whether such a program exists in the user's PATH — and where. No running,
   * only files; on Windows PATHEXT is walked.
   */
  which(name: string): string | null;
  /**
   * Run a subprocess and wait for it.
   *
   * Not a ban on `spawn`: a plugin is free to start node itself. But everything
   * going through the core gets a launch plan for this OS, one ritual for
   * killing, the user's environment and a place in the shared ledger — which is
   * exactly what nobody gets right on their own. Does NOT throw: someone else's
   * refusal is an answer.
   */
  run(ask: RunAsk): Promise<RunResult>;
  /** The same, but output arrives AS IT APPEARS: the network takes seconds. */
  stream(ask: RunAsk, onChunk: (text: string) => void): Promise<RunResult>;
  /**
   * FINISH OFF a process tree.
   *
   * "Please stop" sometimes stays a request: the program holds a handler, spins
   * in a synchronous loop, or lives inside somebody's shell. We strike the TREE:
   * a debug adapter spawns node itself, and killing one pid would leave an
   * orphan holding a port.
   *
   * The root has to be in the core's ledger — we only kill what the IDE started
   * itself; somebody else's pid is a refusal rather than a quiet `kill`.
   * `self: false` means descendants only: that is how a program in a terminal is
   * killed while the user keeps their shell. Returns how many were killed.
   */
  killTree(pid: number, options?: { self?: boolean; signal?: 'SIGTERM' | 'SIGKILL' }): Promise<number>;
  readonly log: Logger;
  /**
   * The plugin PACKAGE's directory. The built server half does not live in it
   * but in the state directory, so `import.meta.url` lies there: anything looked
   * up relative to the package — dependencies via `require.resolve`, assets — is
   * looked up from here.
   */
  readonly dir: string;
  /**
   * THIS plugin's state directory outside the project: whatever survives a
   * restart and does not belong to the project — history, caches — is written
   * here rather than into a constant.
   */
  readonly state: string;
}

/** A plugin as a value: a constructor that takes the services. */
export type PluginClass<T = unknown> = new (ide: Ide) => T;

/**
 * A method callable from the client.
 *
 * Collected OUTSIDE the instance rather than in a field: the services arrive
 * through the constructor, and a decorator's initializer runs before the
 * constructor body has assigned them. The host scoops the list up right after
 * `new` — before it calls `@activate`.
 *
 * The types here are deliberately loose: strictness is needed at the CALL SITE,
 * and a decorator is machinery whose own signature catches nothing while getting
 * in the way of writing ordinary code.
 */
export function command(name?: string) {
  return function (method: CommandHandler, ctx: ClassMethodDecoratorContext): void {
    ctx.addInitializer(function (this: unknown) {
      const target = this as object;
      declareMethod(target, name ?? String(ctx.name), method.bind(target));
    });
  };
}

/**
 * The method called when the plugin comes up.
 *
 * An annotation rather than the name `activate` in a base class: a marked method
 * may be PRIVATE. The lifecycle belongs to the host, and there is no reason for
 * it to stick out in the view a neighbouring plugin gets.
 */
export function activate() {
  return function (method: () => unknown, ctx: ClassMethodDecoratorContext): void {
    void ctx;
    ctx.addInitializer(function (this: unknown) {
      setHook(this as object, method.bind(this as object));
    });
  };
}

export * from './server-host.js';
