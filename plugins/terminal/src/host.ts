import { spawn, type IPty } from 'node-pty';
import type { Logger, Project } from '@mosetta/ide-api/server';
import type { ShellChoice, TerminalInfo, TerminalKind } from './types.js';

/**
 * Whether a pseudo-terminal's FOREGROUND PROCESS can be learned at all.
 *
 * On unix this is one system call: `tcgetpgrp` knows exactly whose the foreground
 * process group is, and node-pty hands over its name.
 *
 * On Windows there is no such concept at all. ConPTY has no process groups, and
 * node-pty, instead of saying "I do not know", returns from `pty.process` the field
 * `opt.name` — literally the string `xterm-256color`. It is never equal to the shell's
 * name, so "busy" came out ALWAYS, and the chip held the name of a process that did not
 * exist. There was an answer, the answer was brisk, and the answer was a lie.
 */
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
  /** A command to run right after the shell starts. */
  command?: string;
  /** The absolute working directory. */
  cwd: string;
  cols?: number;
  rows?: number;
  /**
   * Variables ON TOP of the user's environment: the debugger asks for a shell carrying
   * its adapter's address. For a new shell only — a live one's environment cannot be
   * changed, and `runIn` knows what to do about that.
   */
  env?: Record<string, string>;
}

/** How much output we remember so that a tab can restore the screen after a reload. */
const SCROLLBACK_BYTES = 256 * 1024;

/**
 * How often we ask the pty who its foreground process is now. Half a second is about
 * the eye rather than about accuracy: the chip has to light up "at once", and there is
 * no point asking more often — the answer costs one system call.
 */
const BUSY_POLL_MS = 500;

/**
 * Whether this machine can name the foreground process. Computed once: the platform
 * does not change while we run.
 */
const NO_FOREGROUND = noForeground();

interface Terminal {
  info: TerminalInfo;
  pty: IPty | null;
  buffer: string;
  release: () => void;
  /** Leave the shared ledger of subprocesses. */
  unlist: () => void;
  /** The name of the shell the terminal started with: that is what we compare against. */
  shell: string;
}

export class TerminalHost {
  private readonly terminals = new Map<string, Terminal>();
  /**
   * Who on the server reads a terminal's output by name: the debugger is waiting for an
   * address.
   */
  private readonly watchers = new Map<string, Set<(data: string) => void>>();
  private busyTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(
    private readonly project: Project,
    private readonly log: Logger,
    /**
     * What to launch the shell with — asked at launch time rather than when the host is
     * created: the setting changes on the fly, and the next terminal has to start with
     * the new one.
     */
    private readonly shellOf: () => ShellChoice,
  ) {}

  list(): TerminalInfo[] {
    return [...this.terminals.values()]
      .map((terminal) => terminal.info)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Set up a new manual terminal. A free name is picked: `manual`, `manual-2`,
   * `manual-3`. It merges into nothing — that is the point.
   */
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

  /**
   * Open, or return the existing one by name. A dead one under the same name is
   * restarted: a click on a finished script means "run it again".
   */
  open(options: OpenOptions): TerminalInfo {
    const existing = this.terminals.get(options.name);
    if (existing?.info.alive) return existing.info;
    if (existing) this.forget(options.name);

    const shell = this.shellOf();
    if (shell.problem) {
      this.log.warn(
        `the shell «${shell.problem}» was not found on this machine — launching ${shell.file}`,
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
        `Could not open the terminal: ${err instanceof Error ? err.message : String(err)}`,
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
      release: this.project.hold(`terminal ${options.name}`),
      unlist: this.project.spawned(
        { pid: pty.pid, command: shell.file, reason: `terminal ${options.name}` },
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
      this.log.info(`terminal ${options.name} exited (${exitCode})`);
      this.emit('exit', { name: options.name, exitCode });
      this.announce();
    });

    if (options.command) {
      pty.write(`${options.command}\r`);
    }

    this.log.info(`terminal ${options.name} opened (pid ${pty.pid})`);
    this.watchBusy();
    this.announce();
    return info;
  }

  /**
   * RUN a command in the terminal with this name.
   *
   * `open` on a live terminal returns it as it is — that is the scripts' rule: a second
   * click on `dev` shows the same terminal rather than starting a second one. The
   * debugger needs something else: every launch has to run. So a live and free terminal
   * gets the command at its prompt, a busy one is killed and opened afresh (the
   * previous program is still alive in it, and its stdin is no place for our command),
   * and a dead one is restarted as usual.
   *
   * Busyness is asked OF THE PTY right now rather than taken from the last poll:
   * between the previous program ending and this call there are milliseconds, the poll
   * runs twice a second, and a stale "busy" would cost the user their buffer.
   */
  runIn(options: OpenOptions & { command: string; sameShell?: string }): TerminalInfo {
    const existing = this.terminals.get(options.name);
    if (existing?.pty && existing.info.alive) {
      if (this.busyNow(existing)) {
        this.log.info(`terminal ${options.name} is busy — restarting it for the new command`);
        this.close(options.name);
        return this.open(options);
      }
      existing.pty.write(`${options.sameShell ?? options.command}\r`);
      return existing.info;
    }
    return this.open(options);
  }

  /**
   * Read a terminal's output ON THE SERVER. Tabs receive it as events anyway; a
   * neighbouring plugin needs the same stream on its own side — the debugger is waiting
   * in it for the address of a server that came up. Returns an unsubscribe; by name
   * rather than by terminal, since that one may die and be born again.
   */
  watch(name: string, listener: (data: string) => void): () => void {
    const set = this.watchers.get(name) ?? new Set();
    set.add(listener);
    this.watchers.set(name, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.watchers.delete(name);
    };
  }

  /**
   * Whether SOMEBODY ELSE'S program is running in the terminal — and what its pid is.
   *
   * The debugger needs exactly this: it asked a program to stop, and the question "is
   * it still alive?" decides whether to show the skull button. We hand over the SHELL's
   * pid: the program itself is its descendant, and it is killed as a tree, leaving the
   * user their shell.
   */
  running(name: string): { pid: number | undefined } | null {
    const terminal = this.terminals.get(name);
    if (!terminal?.pty || !terminal.info.alive) return null;
    return this.busyNow(terminal) ? { pid: terminal.pty.pid } : null;
  }

  /**
   * Whether the terminal is busy RIGHT NOW. Where the machine cannot answer, we trust
   * the last answer.
   */
  private busyNow(terminal: Terminal): boolean {
    if (NO_FOREGROUND || !terminal.pty) return terminal.info.busy;
    try {
      const front = baseName(terminal.pty.process);
      return front !== '' && front !== terminal.shell;
    } catch {
      return terminal.info.busy;
    }
  }

  /**
   * A terminal's busyness: who the foreground process is.
   *
   * This is not a guess from the output, nor a heuristic of "after Enter we count it
   * busy" — the pty knows exactly whose the foreground process group is, and node-pty
   * hands over its name. If it is the same shell we started with, the user is standing
   * at the prompt and the terminal is free, even if the screen is full of text. It
   * costs one system call, so there is no reluctance to poll.
   *
   * All of that is about unix. Whether THIS machine can answer the question at all is
   * said above: on Windows it cannot, and then it is more honest not to poll than to
   * poll and receive a lie.
   */
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
    this.log.info(`terminal ${name} closed on request`);
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
      this.log.info(`killing the terminals along with the workspace: ${this.terminals.size}`);
    }
    for (const name of [...this.terminals.keys()]) {
      this.terminals.get(name)?.pty?.kill();
      this.forget(name);
    }
  }

  /**
   * The terminal's environment: the user's, plus our own.
   *
   * PATH and the rest come from the user's shell — otherwise, running under Electron,
   * neither `node` nor `pnpm` would be found in the terminal. The colour we add
   * ourselves: that is knowledge ABOUT THE TERMINAL, and it has nowhere else to live.
   */
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
    if (!terminal) throw new Error(`No terminal ${name}`);
    return terminal;
  }

  /**
   * Tell the tabs. Straight to the project, with no layer of subscribers in between.
   *
   * In the core there used to be an `on`/`listeners` of its own here, because the
   * bridge to the tabs was built by somebody else. Now the host has the project in its
   * hands, and a second delivery route would be a second place obliged to agree: a test
   * would subscribe differently from the server half and would silently drift from it.
   */
  private emit(event: string, payload: unknown): void {
    this.project.emit(event, payload);
  }

  /** The list changed: redraw the chips. */
  private announce(): void {
    this.emit('list', this.list());
  }

  /**
   * A short caption for a chip: `@mosetta/ide-server::dev` → `server::dev`. Manual
   * names are short anyway, so we leave them alone.
   */
  private titleOf(name: string): string {
    return name.replace(/^@[^/]+\//, '');
  }
}

/** `/bin/zsh` → `zsh`, `-zsh` → `zsh`: a login shell introduces itself with a hyphen. */
function baseName(command: string): string {
  const tail = command.split(/[\\/]/).pop() ?? command;
  return tail.replace(/^-/, '');
}

function trim(buffer: string): string {
  return buffer.length <= SCROLLBACK_BYTES ? buffer : buffer.slice(-SCROLLBACK_BYTES);
}
