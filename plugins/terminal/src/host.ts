import { spawn, type IPty } from 'node-pty';
import type { Logger, Project } from '@mosetta/ide-api/server';
import type { ShellChoice, TerminalInfo, TerminalKind } from './types.js';

function noForeground(): { who: string; why: string } | null {
  if (process.platform !== 'win32') return null;
  return {
    who: 'ConPTY',
    why: 'Windows has no foreground process group — the terminal cannot say what is running in it',
  };
}

export interface OpenOptions {
  name: string;
  kind?: TerminalKind;
  command?: string;
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

const SCROLLBACK_BYTES = 256 * 1024;

const BUSY_POLL_MS = 500;

const NO_FOREGROUND = noForeground();

interface Terminal {
  info: TerminalInfo;
  pty: IPty | null;
  buffer: string;
  release: () => void;
  unlist: () => void;
  shell: string;
}

export class TerminalHost {
  private readonly terminals = new Map<string, Terminal>();
  private readonly watchers = new Map<string, Set<(data: string) => void>>();
  private busyTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(
    private readonly project: Project,
    private readonly log: Logger,
    private readonly shellOf: () => ShellChoice,
  ) {}

  list(): TerminalInfo[] {
    return [...this.terminals.values()]
      .map((terminal) => terminal.info)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  create(options: { cwd: string; cols?: number; rows?: number }): TerminalInfo {
    return this.open({ ...options, name: this.freeManualName(), kind: 'manual' });
  }

  private freeManualName(): string {
    if (!this.terminals.has('manual')) return 'manual';
    for (let n = 2; ; n += 1) {
      const name = `manual-${n}`;
      if (!this.terminals.has(name)) return name;
    }
  }

  open(options: OpenOptions): TerminalInfo {
    const existing = this.terminals.get(options.name);
    if (existing?.info.alive) return existing.info;
    if (existing) this.forget(options.name);

    const shell = this.shellOf();
    if (shell.problem) {
      this.log.warn(
        `оболочка «${shell.problem}» на этой машине не нашлась — запускаю ${shell.file}`,
      );
    }
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;

    let pty: IPty;
    try {
      pty = spawn(shell.file, shell.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: options.cwd,
        env: { ...this.env(), ...(options.env ?? {}) },
      });
    } catch (err) {
      throw new Error(
        `Не удалось открыть терминал: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const info: TerminalInfo = {
      name: options.name,
      title: this.titleOf(options.name),
      kind: options.kind ?? 'manual',
      pid: pty.pid,
      cols,
      rows,
      alive: true,
      ...(options.command ? { command: options.command } : {}),
      busy: false,
      ...(NO_FOREGROUND ? { busyUnknown: `${NO_FOREGROUND.who}: ${NO_FOREGROUND.why}` } : {}),
      createdAt: Date.now(),
    };

    const terminal: Terminal = {
      info,
      pty,
      buffer: '',
      release: this.project.hold(`терминал ${options.name}`),
      unlist: this.project.spawned(
        { pid: pty.pid, command: shell.file, reason: `терминал ${options.name}` },
        () => pty.kill(),
      ),
      shell: baseName(shell.file),
    };
    this.terminals.set(options.name, terminal);

    pty.onData((data) => {
      terminal.buffer = trim(terminal.buffer + data);
      this.emit('data', { name: options.name, data });
      for (const watcher of this.watchers.get(options.name) ?? []) watcher(data);
    });

    pty.onExit(({ exitCode }) => {
      terminal.unlist();
      terminal.pty = null;
      terminal.info = { ...terminal.info, alive: false, exitCode, busy: false };
      delete terminal.info.running;
      terminal.release();
      this.log.info(`терминал ${options.name} завершился (${exitCode})`);
      this.emit('exit', { name: options.name, exitCode });
      this.announce();
    });

    if (options.command) {
      pty.write(`${options.command}\r`);
    }

    this.log.info(`терминал ${options.name} открыт (pid ${pty.pid})`);
    this.watchBusy();
    this.announce();
    return info;
  }

  runIn(options: OpenOptions & { command: string; sameShell?: string }): TerminalInfo {
    const existing = this.terminals.get(options.name);
    if (existing?.pty && existing.info.alive) {
      if (this.busyNow(existing)) {
        this.log.info(`терминал ${options.name} занят — перезапускаю ради новой команды`);
        this.close(options.name);
        return this.open(options);
      }
      existing.pty.write(`${options.sameShell ?? options.command}\r`);
      return existing.info;
    }
    return this.open(options);
  }

  watch(name: string, listener: (data: string) => void): () => void {
    const set = this.watchers.get(name) ?? new Set();
    set.add(listener);
    this.watchers.set(name, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.watchers.delete(name);
    };
  }

  private busyNow(terminal: Terminal): boolean {
    if (NO_FOREGROUND || !terminal.pty) return terminal.info.busy;
    try {
      const front = baseName(terminal.pty.process);
      return front !== '' && front !== terminal.shell;
    } catch {
      return terminal.info.busy;
    }
  }

  private watchBusy(): void {
    if (NO_FOREGROUND) return;
    if (this.busyTimer || this.disposed) return;
    this.busyTimer = setInterval(() => this.pollBusy(), BUSY_POLL_MS);
    this.busyTimer.unref?.();
  }

  private pollBusy(): void {
    let changed = false;
    let alive = 0;

    for (const terminal of this.terminals.values()) {
      if (!terminal.pty || !terminal.info.alive) continue;
      alive += 1;

      let front: string;
      try {
        front = baseName(terminal.pty.process);
      } catch {
        continue;
      }
      const busy = front !== '' && front !== terminal.shell;
      if (busy === terminal.info.busy && (!busy || terminal.info.running === front)) continue;

      const info: TerminalInfo = { ...terminal.info, busy };
      if (busy) info.running = front;
      else delete info.running;
      terminal.info = info;
      changed = true;
    }

    if (alive === 0 && this.busyTimer) {
      clearInterval(this.busyTimer);
      this.busyTimer = null;
    }
    if (changed) this.announce();
  }

  attach(name: string): { info: TerminalInfo; buffer: string } {
    const terminal = this.require(name);
    return { info: terminal.info, buffer: terminal.buffer };
  }

  write(name: string, data: string): void {
    const terminal = this.require(name);
    terminal.pty?.write(data);
  }

  resize(name: string, cols: number, rows: number): void {
    const terminal = this.require(name);
    if (cols < 1 || rows < 1) return;
    terminal.info = { ...terminal.info, cols, rows };
    try {
      terminal.pty?.resize(cols, rows);
    } catch {}
  }

  close(name: string): void {
    const terminal = this.terminals.get(name);
    if (!terminal) return;
    this.log.info(`терминал ${name} закрыт по просьбе`);
    terminal.pty?.kill();
    this.forget(name);
    this.announce();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.busyTimer) {
      clearInterval(this.busyTimer);
      this.busyTimer = null;
    }
    if (this.terminals.size > 0) {
      this.log.info(`гашу терминалы вместе с воркспейсом: ${this.terminals.size}`);
    }
    for (const name of [...this.terminals.keys()]) {
      this.terminals.get(name)?.pty?.kill();
      this.forget(name);
    }
  }

  private env(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') out[key] = value;
    }
    Object.assign(out, this.shellOf().env);
    return {
      ...out,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    };
  }

  private forget(name: string): void {
    const terminal = this.terminals.get(name);
    if (!terminal) return;
    if (terminal.info.alive) terminal.release();
    terminal.unlist();
    this.terminals.delete(name);
  }

  private require(name: string): Terminal {
    const terminal = this.terminals.get(name);
    if (!terminal) throw new Error(`Нет терминала ${name}`);
    return terminal;
  }

  private emit(event: string, payload: unknown): void {
    this.project.emit(event, payload);
  }

  private announce(): void {
    this.emit('list', this.list());
  }

  private titleOf(name: string): string {
    return name.replace(/^@[^/]+\//, '');
  }
}

function baseName(command: string): string {
  const tail = command.split(/[\\/]/).pop() ?? command;
  return tail.replace(/^-/, '');
}

function trim(buffer: string): string {
  return buffer.length <= SCROLLBACK_BYTES ? buffer : buffer.slice(-SCROLLBACK_BYTES);
}
