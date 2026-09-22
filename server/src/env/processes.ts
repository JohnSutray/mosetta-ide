import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { ProcessMemory } from './memory.js';
import type { Exec } from './exec.js';
import { journal } from '../log.js';

const log = journal.logger('proc');

/**
 * The intention an environment is assembled with. Not a flag: a flag says WHAT to set,
 * an intention says WHY, and the list of variables under it grows.
 */
export type Wish = 'no-prompts' | 'machine-readable' | 'user-shell';

/**
 * The known ways of saying "do not ask".
 *
 * The list looks git-specific, and its place is here all the same: a process hanging
 * forever is a property of LAUNCHING (there is no terminal, there is nobody to ask)
 * rather than a property of git. The next tool that takes it into its head to ask for a
 * password adds a line here instead of rediscovering this ailment from scratch.
 */
function noPrompts(): Record<string, string> {
  return {
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    SSH_ASKPASS_REQUIRE: 'never',
    GIT_SSH_COMMAND: `${process.env.GIT_SSH_COMMAND ?? 'ssh'} -oBatchMode=yes`,
  };
}

/**
 * Machine-readable output: English messages parse the same way on any machine. We show
 * them to a human as they are, and parse only machine formats (`--porcelain`,
 * `--format`) rather than prose.
 */
function machineReadable(): Record<string, string> {
  return { LC_ALL: 'C', LANG: 'C' };
}

/**
 * Who answers the question "what environment does the user have in their terminal".
 *
 * Under its own type so that it arrives through the constructor: otherwise a test could
 * not substitute its own, and the shell environment would be dragged into every launch
 * as a hidden dependency.
 */
export interface UserEnv {
  readonly current: Record<string, string> | null;
}

export interface RunSpec {
  command: string;
  args: string[];
  /** The working directory. Without it, the server's own. */
  cwd?: string;
  /**
   * Who asked: a project root, or the empty string for the machine as a whole. It is
   * what the orphan cleanup uses when a project closes.
   */
  owner?: string;
  /**
   * Why it was started, in human words: it travels into the journal and into the list
   * of live processes.
   */
  reason: string;
  /** Intentions about the environment; specific variables from `env` go on top of them. */
  wants?: Wish[];
  env?: Record<string, string>;
  /** How long until we kill it. By default, never. */
  timeoutMs?: number;
  /** How much output will fit: silent truncation is the worst kind of error. */
  maxBuffer?: number;
}

export interface Ran {
  ok: boolean;
  stdout: string;
  stderr: string;
  /**
   * The exit code. `null` means it never got as far as exiting: it did not start, or it
   * was killed.
   */
  code: number | null;
  /** Killed by the timeout. Which is not the same as "it refused". */
  timedOut: boolean;
  /** The output did not fit and was cut off. Said out loud rather than swallowed. */
  truncated: boolean;
}

/** A row in the ledger: what is alive right now, and why. */
export interface Running {
  id: number;
  pid: number | undefined;
  command: string;
  reason: string;
  owner: string;
  startedAt: number;
  /**
   * A pseudo-terminal that joined the ledger by itself: only its owner knows how to
   * kill it.
   */
  adopted: boolean;
}

/** A long-lived subprocess: we hand the pipes over as they are and kill it through us. */
export interface Handle {
  readonly id: number;
  readonly child: ChildProcessWithoutNullStreams;
  kill(signal?: NodeJS.Signals): void;
  /**
   * The memory of a process and its descendants, in MB; `null` means it cannot be
   * measured.
   */
  memoryMb(): Promise<number | null>;
}

interface Entry {
  info: Running;
  kill(signal?: NodeJS.Signals): void;
}

/** How long to wait after SIGTERM before striking to kill. */
const GRACE_MS = 2000;

/** The tail of the output, kept for the sake of a complaint. */
const TAIL = 2000;

export class Processes {
  private readonly live = new Map<number, Entry>();
  private next = 1;

  /**
   * The user's environment rather than the server's.
   *
   * We still launch PAST the shell — but the variables we take are the ones it set up.
   * The ones asking for this are the tools the user installed themselves: git,
   * language servers, package managers. The system's `open` and `explorer.exe` do not
   * need it: they lie where they have always lain.
   */
  constructor(
    private readonly userEnv: UserEnv,
    /** How to launch a command on this system. */
    private readonly exec: Pick<Exec, 'plan'>,
    /**
     * What measures a tree's memory. As an instance rather than an import: a test slips
     * its own in and never calls `ps`.
     */
    private readonly memory: Pick<ProcessMemory, 'treeMb' | 'descendants'> = new ProcessMemory(),
  ) {}

  /**
   * Launch and wait. Does NOT throw: somebody else's refusal is an answer rather than
   * an accident. What to call it is up to the caller: git shows stderr to the user, a
   * language server moves itself to `failed`, and revealing a file in the file manager
   * is the only one that really is an error.
   */
  run(spec: RunSpec): Promise<Ran> {
    return this.collect(spec, null);
  }

  /**
   * Launch and hand over the output AS IT APPEARS.
   *
   * `fetch`, `pull` and `push` go over the network and take seconds: showing a frozen
   * interface meanwhile is a lie that nothing is happening. Both streams go into one:
   * progress is printed to stderr.
   */
  stream(spec: RunSpec, onChunk: (text: string) => void): Promise<Ran> {
    return this.collect(spec, onChunk);
  }

  /**
   * A long-lived process: the caller needs the pipes raw (a language server speaks LSP
   * over stdin/stdout). We hand the child over as it is — this is the base layer, not a
   * wall.
   */
  start(spec: RunSpec): Handle {
    const plan = this.exec.plan(spec.command, spec.args);
    const child = spawn(plan.command, plan.args, {
      cwd: spec.cwd,
      env: this.envFor(spec),
      shell: plan.shell,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;

    const id = this.remember(spec, child);
    child.on('exit', (code, signal) => this.forget(id, code, signal));
    child.on('error', () => this.forget(id, null, null));

    return {
      id,
      child,
      kill: (signal?: NodeJS.Signals) => this.stop(child, signal),
      memoryMb: () => this.memory.treeMb(child.pid),
    };
  }

  /**
   * Somebody else's process joins the ledger by itself.
   *
   * Needed by a pseudo-terminal: it is born in node-pty rather than here, yet "who is
   * alive right now" has to answer truthfully — otherwise the ledger shows half of it
   * and people stop using it. Returns a forget.
   */
  adopt(
    info: { pid: number | undefined; command: string; reason: string; owner?: string },
    kill: () => void,
  ): () => void {
    const id = this.next++;
    this.live.set(id, {
      info: {
        id,
        pid: info.pid,
        command: info.command,
        reason: info.reason,
        owner: info.owner ?? '',
        startedAt: Date.now(),
        adopted: true,
      },
      kill,
    });
    return () => this.live.delete(id);
  }

  /**
   * FINISH OFF a process tree.
   *
   * "Please stop" sometimes stays a request: the program holds a handler, spins in a
   * synchronous loop, or lives inside somebody else's shell rather than in our hands.
   * WebStorm has a skull button for this case, and so do we — but the striking has to
   * be done TO THE TREE: a debug adapter spawns node itself, and killing one pid would
   * leave an orphan holding a port.
   *
   * Only what the IDE STARTED may be killed: the root has to be in the ledger, either
   * as ours or as adopted. Otherwise this would be a door to any process on the
   * machine, opened to plugins.
   *
   * `self: false` means descendants only: that is how a program in a terminal is killed
   * while the user keeps their shell.
   *
   * Returns how many were killed. Descendants are struck FIRST: a parent killed first
   * spawns orphans that can no longer be found through the tree.
   */
  async killTree(pid: number, options: { self?: boolean; signal?: NodeJS.Signals } = {}): Promise<number> {
    const known = [...this.live.values()].some((entry) => entry.info.pid === pid);
    if (!known) throw new Error(`process ${pid} is not ours: we only kill what we started ourselves`);
    const signal = options.signal ?? 'SIGKILL';
    const kids = (await this.memory.descendants(pid)) ?? [];
    let killed = 0;
    for (const one of [...kids].reverse()) killed += this.signal(one, signal);
    if (options.self !== false) killed += this.signal(pid, signal);
    log.info(`processes finished off: ${killed} (tree of ${pid}, ${signal})`);
    return killed;
  }

  /**
   * Send a signal to a pid. No such process is no misfortune: it means it has already
   * died.
   */
  private signal(pid: number, signal: NodeJS.Signals): number {
    try {
      process.kill(pid, signal);
      return 1;
    } catch {
      return 0;
    }
  }

  /** Who is alive right now. A copy: from the outside the ledger is read-only. */
  alive(): Running[] {
    return [...this.live.values()].map((entry) => ({ ...entry.info }));
  }

  /**
   * Kill everything this owner asked for.
   *
   * Called when a project closes. Before this layer existed, an orphaned `git fetch`
   * lived out its days on its own: nobody knew it was there.
   */
  killOwned(owner: string): number {
    let killed = 0;
    for (const entry of [...this.live.values()]) {
      if (entry.info.owner !== owner) continue;
      if (entry.info.adopted) continue;
      log.warn(`orphaned and killed: ${entry.info.reason} (pid ${entry.info.pid ?? '?'})`);
      entry.kill();
      killed += 1;
    }
    return killed;
  }

  private envFor(spec: RunSpec): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const wish of spec.wants ?? []) {
      if (wish === 'no-prompts') Object.assign(env, noPrompts());
      else if (wish === 'machine-readable') Object.assign(env, machineReadable());
      else Object.assign(env, this.userEnv.current ?? {});
    }
    return { ...env, ...spec.env };
  }

  private remember(spec: RunSpec, child: ChildProcess): number {
    const id = this.next++;
    this.live.set(id, {
      info: {
        id,
        pid: child.pid,
        command: spec.command,
        reason: spec.reason,
        owner: spec.owner ?? '',
        startedAt: Date.now(),
        adopted: false,
      },
      kill: (signal?: NodeJS.Signals) => this.stop(child, signal),
    });
    log.debug(`started ${spec.reason} (pid ${child.pid ?? '?'})`);
    return id;
  }

  private forget(id: number, code: number | null, signal: NodeJS.Signals | null): void {
    const entry = this.live.get(id);
    if (!entry) return;
    this.live.delete(id);
    const spent = Date.now() - entry.info.startedAt;
    log.debug(`${entry.info.reason}: ${code ?? signal ?? 'no code'} in ${spent} ms`);
  }

  /**
   * We kill politely: a request first, then, after a pause, to death.
   *
   * This used to be done in three places and three different ways: one sent SIGTERM
   * silently, another went straight to SIGKILL, and a language server was never killed
   * at all.
   */
  private stop(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill(signal);
    if (signal === 'SIGKILL') return;
    const hard = setTimeout(() => child.kill('SIGKILL'), GRACE_MS);
    hard.unref?.();
    child.once('exit', () => clearTimeout(hard));
  }

  private collect(spec: RunSpec, onChunk: ((text: string) => void) | null): Promise<Ran> {
    const plan = this.exec.plan(spec.command, spec.args);
    return new Promise((resolve) => {
      const child = spawn(plan.command, plan.args, {
        cwd: spec.cwd,
        env: this.envFor(spec),
        shell: plan.shell,
      });
      const id = this.remember(spec, child);

      let out = '';
      let err = '';
      let tail = '';
      let size = 0;
      let truncated = false;
      let timedOut = false;
      let done = false;

      const timer =
        spec.timeoutMs === undefined
          ? null
          : setTimeout(() => {
              timedOut = true;
              onChunk?.('\n[timed out, process killed]\n');
              this.stop(child);
            }, spec.timeoutMs);
      timer?.unref?.();

      const feed = (data: Buffer, stream: 'out' | 'err') => {
        const text = data.toString();
        tail = (tail + text).slice(-TAIL);
        if (onChunk) {
          onChunk(text);
          return;
        }
        size += Buffer.byteLength(text);
        if (spec.maxBuffer !== undefined && size > spec.maxBuffer) {
          if (!truncated) {
            truncated = true;
            this.stop(child);
          }
          return;
        }
        if (stream === 'out') out += text;
        else err += text;
      };
      child.stdout?.on('data', (data: Buffer) => feed(data, 'out'));
      child.stderr?.on('data', (data: Buffer) => feed(data, 'err'));

      const finish = (ran: Ran) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        this.forget(id, ran.code, null);
        resolve(ran);
      };

      child.on('error', (error) => {
        finish({
          ok: false,
          stdout: out,
          stderr: error.message,
          code: null,
          timedOut,
          truncated,
        });
      });
      child.on('close', (code) => {
        finish({
          ok: code === 0 && !timedOut && !truncated,
          stdout: out,
          stderr: truncated
            ? `output over ${spec.maxBuffer} bytes — process killed, the answer is incomplete`
            : err.trim() || (onChunk && code !== 0 ? tail : ''),
          code,
          timedOut,
          truncated,
        });
      });
    });
  }
}
