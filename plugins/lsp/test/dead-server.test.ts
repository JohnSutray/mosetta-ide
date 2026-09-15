import { describe, expect, it, vi } from 'vitest';
import { LspServer } from '../src/lsp-server.js';
import { Toolchain } from '../src/toolchain.js';
import type { LspEvent } from '../src/lsp-server.js';
import type { Logger, ProcessChild, ProcessHandle, ProjectMemory } from '@mosetta/ide-api/server';
import type { LspServerSettings } from '../src/settings.js';

class FakeChild implements ProcessChild {
  private readonly handlers = new Map<string, Array<(...args: never[]) => void>>();
  readonly written: string[] = [];
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

describe('языковой сервер, которого нет', () => {
  it('команда не нашлась — причина НАСТОЯЩАЯ, а не «не ответил»', async () => {
    const { server, child } = make();
    const booting = server.start();
    child.writable = false;
    child.emit('error', new Error('spawn typescript-language-server ENOENT'));
    await booting;

    const status = server.status();
    expect(status.state).toBe('failed');
    expect(status.detail).toBe('typescript-language-server: spawn typescript-language-server ENOENT');
    expect(status.detail).not.toContain('не ответил');
  });

  it('причина говорится СРАЗУ, а не через пятнадцать секунд', async () => {
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

  it('процесс умер кодом — так и написано, и тоже сразу', async () => {
    const { server, child } = make();
    const booting = server.start();
    child.emit('exit', 127, null);
    await booting;
    expect(server.status().detail).toBe('процесс завершился (127)');
  });

  it('жив, но молчит — вот ТОГДА таймаут', async () => {
    vi.useFakeTimers();
    try {
      const { server } = make();
      const booting = server.start();
      await vi.advanceTimersByTimeAsync(15_000);
      await booting;
      expect(server.status().detail).toBe('initialize: сервер не ответил за 15 с');
    } finally {
      vi.useRealTimers();
    }
  });

  it('о смерти объявлено наружу — статусом, а не только в журнал', async () => {
    const { server, child, events } = make();
    const booting = server.start();
    child.writable = false;
    child.emit('error', new Error('spawn typescript-language-server ENOENT'));
    await booting;

    const said = events.filter((one) => one.type === 'status').map((one) => one.status.state);
    expect(said).toEqual(['starting', 'failed']);
  });

  it('одну и ту же беду не повторяет дважды', async () => {
    const { server, child, events } = make();
    const booting = server.start();
    child.writable = false;
    child.emit('error', new Error('spawn typescript-language-server ENOENT'));
    await booting;
    expect(events.filter((one) => one.type === 'status')).toHaveLength(2);
  });
});
