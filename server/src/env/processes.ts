import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { exec } from './exec.js';
import { shellEnv } from './shell-env.js';
import { journal } from '../log.js';

const log = journal.logger('proc');

export type Wish = 'no-prompts' | 'machine-readable' | 'user-shell';

function noPrompts(): Record<string, string> {
  return {
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    SSH_ASKPASS_REQUIRE: 'never',
    GIT_SSH_COMMAND: `${process.env.GIT_SSH_COMMAND ?? 'ssh'} -oBatchMode=yes`,
  };
}

function machineReadable(): Record<string, string> {
  return { LC_ALL: 'C', LANG: 'C' };
}

export interface UserEnv {
  readonly current: Record<string, string> | null;
}

export interface RunSpec {
  command: string;
  args: string[];
  cwd?: string;
  owner?: string;
  reason: string;
  wants?: Wish[];
  env?: Record<string, string>;
  timeoutMs?: number;
  maxBuffer?: number;
}

export interface Ran {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  truncated: boolean;
}

export interface Running {
  id: number;
  pid: number | undefined;
  command: string;
  reason: string;
  owner: string;
  startedAt: number;
  adopted: boolean;
}

export interface Handle {
  readonly id: number;
  readonly child: ChildProcessWithoutNullStreams;
  kill(signal?: NodeJS.Signals): void;
}

interface Entry {
  info: Running;
  kill(signal?: NodeJS.Signals): void;
}

const GRACE_MS = 2000;

const TAIL = 2000;

export class Processes {
  private readonly live = new Map<number, Entry>();
  private next = 1;

  constructor(private readonly userEnv: UserEnv = shellEnv) {}

  run(spec: RunSpec): Promise<Ran> {
    return this.collect(spec, null);
  }

  stream(spec: RunSpec, onChunk: (text: string) => void): Promise<Ran> {
    return this.collect(spec, onChunk);
  }

  start(spec: RunSpec): Handle {
    const plan = exec.plan(spec.command, spec.args);
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
    };
  }

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

  alive(): Running[] {
    return [...this.live.values()].map((entry) => ({ ...entry.info }));
  }

  killOwned(owner: string): number {
    let killed = 0;
    for (const entry of [...this.live.values()]) {
      if (entry.info.owner !== owner) continue;
      if (entry.info.adopted) continue;
      log.warn(`осиротел и убит: ${entry.info.reason} (pid ${entry.info.pid ?? '?'})`);
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
    log.debug(`запущен ${spec.reason} (pid ${child.pid ?? '?'})`);
    return id;
  }

  private forget(id: number, code: number | null, signal: NodeJS.Signals | null): void {
    const entry = this.live.get(id);
    if (!entry) return;
    this.live.delete(id);
    const spent = Date.now() - entry.info.startedAt;
    log.debug(`${entry.info.reason}: ${code ?? signal ?? 'нет кода'} за ${spent} мс`);
  }

  private stop(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill(signal);
    if (signal === 'SIGKILL') return;
    const hard = setTimeout(() => child.kill('SIGKILL'), GRACE_MS);
    hard.unref?.();
    child.once('exit', () => clearTimeout(hard));
  }

  private collect(spec: RunSpec, onChunk: ((text: string) => void) | null): Promise<Ran> {
    const plan = exec.plan(spec.command, spec.args);
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
              onChunk?.('\n[превышено время ожидания, процесс убит]\n');
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
            ? `вывод больше ${spec.maxBuffer} байт — процесс убит, ответ неполный`
            : err.trim() || (onChunk && code !== 0 ? tail : ''),
          code,
          timedOut,
          truncated,
        });
      });
    });
  }
}

export const processes = new Processes();
