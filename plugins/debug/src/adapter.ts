import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import type { ProcessHandle, RunAsk } from '@mosetta/ide-api/server';
import { DapWire } from './wire.js';

export class JsDebugAdapter {
  constructor(
    private readonly dir: string,
    private readonly tempDir: string,
  ) {}

  get script(): string {
    return path.join(this.dir, 'vendor', 'js-debug', 'src', 'dapDebugServer.js');
  }

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

  connect(): Promise<DapWire> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.address);
      socket.once('connect', () => resolve(new DapWire(socket)));
      socket.once('error', reject);
    });
  }

  kill(): void {
    if (this.alive) this.handle.kill();
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
