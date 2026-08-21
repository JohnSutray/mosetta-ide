import { spawn, type IPty } from 'node-pty';
import type { TerminalInfo, TerminalKind } from '@ide/protocol';
import { RpcErrorCode } from '@ide/protocol';
import { RpcError } from '../errors.js';
import type { Logger } from '../log.js';
import { loginShell, terminalEnv } from '../env/shell.js';

export type TerminalEvent =
  | { type: 'data'; name: string; data: string }
  | { type: 'exit'; name: string; exitCode: number }
  | { type: 'list' };

export interface OpenOptions {
  name: string;
  kind?: TerminalKind;
  command?: string;
  cwd: string;
  cols?: number;
  rows?: number;
}

const SCROLLBACK_BYTES = 256 * 1024;

interface Terminal {
  info: TerminalInfo;
  pty: IPty | null;
  buffer: string;
  release: () => void;
}

export class TerminalHost {
  private readonly terminals = new Map<string, Terminal>();
  private readonly listeners = new Set<(event: TerminalEvent) => void>();
  private disposed = false;

  constructor(
    private readonly hold: (reason: string) => () => void,
    private readonly log: Logger,
  ) {}

  on(listener: (event: TerminalEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

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

    const shell = loginShell();
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;

    let pty: IPty;
    try {
      pty = spawn(shell.file, shell.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: options.cwd,
        env: terminalEnv(),
      });
    } catch (err) {
      throw new RpcError(
        RpcErrorCode.Internal,
        `Не удалось открыть терминал: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const info: TerminalInfo = {
      name: options.name,
      title: titleOf(options.name),
      kind: options.kind ?? 'manual',
      pid: pty.pid,
      cols,
      rows,
      alive: true,
      ...(options.command ? { command: options.command } : {}),
      createdAt: Date.now(),
    };

    const terminal: Terminal = {
      info,
      pty,
      buffer: '',
      release: this.hold(`terminal:${options.name}`),
    };
    this.terminals.set(options.name, terminal);

    pty.onData((data) => {
      terminal.buffer = trim(terminal.buffer + data);
      this.emit({ type: 'data', name: options.name, data });
    });

    pty.onExit(({ exitCode }) => {
      terminal.pty = null;
      terminal.info = { ...terminal.info, alive: false, exitCode };
      terminal.release();
      this.log.info(`терминал ${options.name} завершился (${exitCode})`);
      this.emit({ type: 'exit', name: options.name, exitCode });
      this.emit({ type: 'list' });
    });

    if (options.command) {
      pty.write(`${options.command}\r`);
    }

    this.log.info(`терминал ${options.name} открыт (pid ${pty.pid})`);
    this.emit({ type: 'list' });
    return info;
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
    this.emit({ type: 'list' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.terminals.size > 0) {
      this.log.info(`гашу терминалы вместе с воркспейсом: ${this.terminals.size}`);
    }
    for (const name of [...this.terminals.keys()]) {
      this.terminals.get(name)?.pty?.kill();
      this.forget(name);
    }
    this.listeners.clear();
  }

  private forget(name: string): void {
    const terminal = this.terminals.get(name);
    if (!terminal) return;
    if (terminal.info.alive) terminal.release();
    this.terminals.delete(name);
  }

  private require(name: string): Terminal {
    const terminal = this.terminals.get(name);
    if (!terminal) throw new RpcError(RpcErrorCode.NotFound, `Нет терминала ${name}`);
    return terminal;
  }

  private emit(event: TerminalEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export function titleOf(name: string): string {
  return name.replace(/^@[^/]+\//, '');
}

function trim(buffer: string): string {
  return buffer.length <= SCROLLBACK_BYTES ? buffer : buffer.slice(-SCROLLBACK_BYTES);
}
