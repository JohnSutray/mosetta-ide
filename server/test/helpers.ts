import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { WS_PATH, type ApiMethod, type Params, type Result } from '@ide/protocol';
import { startServer, type RunningServer } from '../src/server.js';

export interface TestClient {
  call<M extends ApiMethod>(method: M, params: Params<M>): Promise<Result<M>>;
  expectError<M extends ApiMethod>(method: M, params: Params<M>): Promise<{ code: number; message: string }>;
  events(name: string): unknown[];
  nextEvent(
    name: string,
    timeoutMs?: number,
    match?: (payload: any) => boolean,
  ): Promise<any>;
  close(): Promise<void>;
}

export const TEST_CONFIG_DIR = fileURLToPath(new URL('./fixtures/config', import.meta.url));

export async function withServer(
  idleMs = 60_000,
  configDir = TEST_CONFIG_DIR,
): Promise<RunningServer> {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-state-'));
  return startServer({ port: 0, idleMs, configDir, stateDir, watchConfig: false });
}

export async function connect(server: RunningServer): Promise<TestClient> {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}${WS_PATH}`);
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  const received = new Map<string, unknown[]>();
  const waiters = new Map<string, Array<(payload: unknown) => void>>();
  let nextId = 1;

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  socket.on('message', (data) => {
    const frame = JSON.parse(String(data));
    if (frame.id === undefined) {
      const list = received.get(frame.method) ?? [];
      list.push(frame.params);
      received.set(frame.method, list);
      for (const waiter of waiters.get(frame.method)?.splice(0) ?? []) waiter(frame.params);
      return;
    }
    const slot = pending.get(frame.id);
    if (!slot) return;
    pending.delete(frame.id);
    if (frame.error) slot.reject(frame.error);
    else slot.resolve(frame.result);
  });

  function send(method: string, params: unknown): Promise<any> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  return {
    call: (method, params) => send(method, params),
    async expectError(method, params) {
      try {
        await send(method, params);
      } catch (err) {
        return err as { code: number; message: string };
      }
      throw new Error(`${method} должен был упасть, но вернул результат`);
    },
    events: (name) => received.get(name) ?? [],
    nextEvent(name, timeoutMs = 2000, match) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`не дождались ${name}`)),
          timeoutMs,
        );
        const list = waiters.get(name) ?? [];
        const waiter = (payload: unknown) => {
          if (match && !match(payload)) {
            (waiters.get(name) ?? []).push(waiter);
            waiters.set(name, waiters.get(name) ?? [waiter]);
            return;
          }
          clearTimeout(timer);
          resolve(payload);
        };
        list.push(waiter);
        waiters.set(name, list);
      });
    },
    close() {
      return new Promise<void>((resolve) => {
        socket.once('close', () => resolve());
        socket.close();
      });
    },
  };
}

export async function makeProject(name: string, files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `ide-${name}-`));
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
  return fs.realpath(root);
}

export async function removeProject(root: string) {
  await fs.rm(root, { recursive: true, force: true });
}
