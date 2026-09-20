import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import type { ProcessHandle, RunAsk } from '@mosetta/ide-api/server';
import { DapWire } from './wire.js';

/**
 * The `vscode-js-debug` adapter's process.
 *
 * The adapter is brought along with the editor (`vendor/js-debug`) and is started by
 * the SAME executable we live in ourselves, with `ELECTRON_RUN_AS_NODE=1` — under
 * Electron there may be no second Node.
 *
 * One adapter per ONE run. A shared one per project would save 60 ms of start-up but
 * would mix fates: a fallen adapter would carry off every debugging session at once,
 * and "stop" would have to be sorted out session by session instead of one `kill`.
 *
 * The adapter listens on a UNIX SOCKET in a directory with 0700 rights rather than on a
 * port. A port on localhost is open to any process on the machine, and the adapter
 * starts whatever it is first asked to — that would be a door for somebody else's code.
 */
export class JsDebugAdapter {
  constructor(
    /** The plugin PACKAGE's directory (`ide.dir`): `vendor` is looked for from it. */
    private readonly dir: string,
    /** Where to set up the socket's directory — as a parameter rather than a constant. */
    private readonly tempDir: string,
  ) {}

  get script(): string {
    return path.join(this.dir, 'vendor', 'js-debug', 'src', 'dapDebugServer.js');
  }

  /** Start it and wait until the adapter says it is listening. */
  async open(start: (ask: RunAsk) => ProcessHandle, reason: string): Promise<AdapterProcess> {
    const { address, cleanup } = await this.address();
    let handle: ProcessHandle;
    try {
      handle = start({
        command: process.execPath,
        args: [this.script, address],
        reason,
        wants: ['user-shell'],
        env: { ELECTRON_RUN_AS_NODE: '1' },
      });
    } catch (err) {
      await cleanup();
      throw err;
    }
    const adapter = new AdapterProcess(handle, address, cleanup);
    await adapter.listening();
    return adapter;
  }

  private async address(): Promise<{ address: string; cleanup: () => Promise<void> }> {
    if (process.platform === 'win32') {
      return { address: `\\\\.\\pipe\\mosetta-dap-${randomBytes(8).toString('hex')}`, cleanup: async () => undefined };
    }
    const folder = await mkdtemp(path.join(this.tempDir, 'mosetta-dap-'));
    return {
      address: path.join(folder, 'dap.sock'),
      cleanup: () => rm(folder, { recursive: true, force: true }),
    };
  }
}

/** How long to wait for the adapter's first line. A cold start is 60 ms. */
const LISTEN_TIMEOUT_MS = 10_000;

export class AdapterProcess {
  private stderr = '';
  private exited: string | null = null;
  private readonly exits = new Set<(why: string) => void>();

  constructor(
    private readonly handle: ProcessHandle,
    private readonly address: string,
    private readonly cleanup: () => Promise<void>,
  ) {
    handle.child.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + Buffer.from(chunk).toString('utf8')).slice(-4000);
    });
    handle.child.on('error', (err) => this.exit(err.message));
    handle.child.on('exit', (code, signal) => this.exit(this.explain(code, signal)));
  }

  /**
   * The process has died — with a reason. If it has died already, this is called at
   * once.
   */
  onExit(listener: (why: string) => void): void {
    if (this.exited) listener(this.exited);
    else this.exits.add(listener);
  }

  get alive(): boolean {
    return this.exited === null;
  }

  memoryMb(): Promise<number | null> {
    return this.handle.memoryMb();
  }

  /**
   * A new connection is a new session: that is how the adapter's DAP server tells them
   * apart.
   */
  connect(): Promise<DapWire> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.address);
      socket.once('connect', () => resolve(new DapWire(socket)));
      socket.once('error', reject);
    });
  }

  kill(signal?: 'SIGTERM' | 'SIGKILL'): void {
    if (this.alive) this.handle.kill(signal);
  }

  /** The adapter's pid: the TREE is killed by it — it gives birth to node itself. */
  get pid(): number | undefined {
    return this.handle.child.pid;
  }

  listening(): Promise<void> {
    return new Promise((resolve, reject) => {
      let seen = '';
      const timer = setTimeout(() => {
        this.kill();
        reject(new Error(`debug adapter did not start in ${LISTEN_TIMEOUT_MS / 1000} s`));
      }, LISTEN_TIMEOUT_MS);
      this.handle.child.stdout.on('data', (chunk) => {
        seen += Buffer.from(chunk).toString('utf8');
        if (!/listening at/i.test(seen)) return;
        clearTimeout(timer);
        resolve();
      });
      this.onExit((why) => {
        clearTimeout(timer);
        reject(new Error(`debug adapter exited before listening: ${why}`));
      });
    });
  }

  /**
   * The reason for death in the process's own words. A line with `Error` rather than
   * the tail: the adapter is minified, and Node prints a line of source hundreds of
   * kilobytes long before the error, and after it a stack with no reason in it.
   */
  private explain(code: number | null, signal: string | null): string {
    const lines = this.stderr.split('\n').map((line) => line.trim());
    const cause = lines.find((line) => /^\w*Error\b/.test(line)) ?? lines.filter(Boolean).at(-1) ?? '';
    const how = signal ? `signal ${signal}` : `code ${code}`;
    return cause ? `${how}: ${cause.slice(0, 300)}` : how;
  }

  private exit(why: string): void {
    if (this.exited) return;
    this.exited = why;
    for (const listener of this.exits) listener(why);
    this.exits.clear();
    void this.cleanup();
  }
}
