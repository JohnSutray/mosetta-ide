import { describe, expect, it, vi } from 'vitest';
import { LspServer } from '../src/lsp-server.js';
import { Toolchain } from '../src/toolchain.js';
import type { LspEvent } from '../src/lsp-server.js';
import type { Logger, ProcessChild, ProcessHandle, ProjectMemory } from '@mosetta/ide-api/server';
import type { LspServerSettings } from '../src/settings.js';

/** A subprocess a test can drive. */
class FakeChild implements ProcessChild {
  private readonly handlers = new Map<string, Array<(...args: never[]) => void>>();
  readonly written: string[] = [];
  /** Whether we write into it — an unborn process's pipe is not writable. */
  writable = true;

  readonly stdin = {
    get writable(): boolean {
      return self.writable;
    },
    write: (data: Uint8Array | string): boolean => {
      this.written.push(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
      return true;
    },
    end: () => undefined,
  };

  readonly stdout = { on: (event: 'data', handler: (chunk: Uint8Array) => void) => this.add(event, handler) };
  readonly stderr = { on: (event: 'data', handler: (chunk: Uint8Array) => void) => this.add(event, handler) };

  on(event: 'error' | 'exit', handler: (...args: never[]) => void): unknown {
    return this.add(event, handler);
  }

  private add(event: string, handler: (...args: never[]) => void): unknown {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) (handler as (...a: unknown[]) => void)(...args);
  }
}

let self: FakeChild;

const SETTINGS: LspServerSettings = {
  enabled: true,
  command: 'typescript-language-server',
  args: ['--stdio'],
  extensions: ['ts'],
};

const MEMORY = {
  on: () => () => undefined,
  files: () => [],
  docSync: () => null,
} as unknown as ProjectMemory;

function silent(): Logger {
  return { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
}

function make(): { server: LspServer; child: FakeChild; events: LspEvent[] } {
  const child = new FakeChild();
  self = child;
  const handle: ProcessHandle = { child, kill: () => undefined, memoryMb: async () => null };
  const server = new LspServer(
    'typescript',
    SETTINGS,
    '/project',
    MEMORY,
    () => handle,
    new Toolchain('/plugin'),
    silent(),
  );
  const events: LspEvent[] = [];
  server.on((event) => events.push(event));
  return { server, child, events };
}

describe('a language server that does not exist', () => {
  it('the command was not found — the reason is the REAL one rather than "did not answer"', async () => {
    const { server, child } = make();
    const booting = server.start();
    child.writable = false;
    child.emit('error', new Error('spawn typescript-language-server ENOENT'));
    await booting;

    const status = server.status();
    expect(status.state).toBe('failed');
    expect(status.detail).toBe('typescript-language-server: spawn typescript-language-server ENOENT');
    expect(status.detail).not.toContain('did not answer');
  });

  it('the reason is said AT ONCE rather than fifteen seconds later', async () => {
    vi.useFakeTimers();
    try {
      const { server, child } = make();
      const booting = server.start();
      child.writable = false;
      child.emit('error', new Error('spawn typescript-language-server ENOENT'));
      await booting;
      expect(server.status().state).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the process died with a code — that is what it says, and at once too', async () => {
    const { server, child } = make();
    const booting = server.start();
    child.emit('exit', 127, null);
    await booting;
    expect(server.status().detail).toBe('the process exited (127)');
  });

  it('alive but silent — THEN comes the timeout', async () => {
    vi.useFakeTimers();
    try {
      const { server } = make();
      const booting = server.start();
      await vi.advanceTimersByTimeAsync(15_000);
      await booting;
      expect(server.status().detail).toBe('initialize: the server did not answer within 15 s');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the death is announced outwards — as a status rather than only in the journal', async () => {
    const { server, child, events } = make();
    const booting = server.start();
    child.writable = false;
    child.emit('error', new Error('spawn typescript-language-server ENOENT'));
    await booting;

    const said = events.filter((one) => one.type === 'status').map((one) => one.status.state);
    expect(said).toEqual(['starting', 'failed']);
  });

  it('it does not repeat one and the same trouble twice', async () => {
    const { server, child, events } = make();
    const booting = server.start();
    child.writable = false;
    child.emit('error', new Error('spawn typescript-language-server ENOENT'));
    await booting;
    expect(events.filter((one) => one.type === 'status')).toHaveLength(2);
  });
});
