import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

const MERGE = '@ide/plugin-merge';
interface Session {
  source: string;
  title: string;
  files: Array<{ path: string; base: string | null; left: { text: string | null }; right: { text: string | null } }>;
}
function merge(c: TestClient, method: string, params: unknown = null): Promise<Session | null> {
  return c.call('plugins.call', { name: MERGE, method, params }) as Promise<Session | null>;
}
async function nextState(c: TestClient, match: (state: Session | null) => boolean): Promise<Session> {
  const event = (await c.nextEvent('plugins.event', 8000, (e) => e.name === MERGE && e.event === 'state' && match(e.payload))) as {
    payload: Session;
  };
  return event.payload;
}

const CONFIG = fileURLToPath(new URL('./fixtures/config-watch', import.meta.url));

describe('слияние', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  async function diverge(text = 'один\nдва\nТРИ\n'): Promise<void> {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'ОДИН\nдва\nтри\n',
      baseVersion: doc.version,
    });
    const waiting = c.nextEvent('doc.diverged', 8000);
    await fs.writeFile(path.join(root, 'src', 'main.ts'), text, 'utf8');
    await waiting;
  }

  beforeEach(async () => {
    server = await withServer(60_000, CONFIG);
    root = await makeProject('merge', { 'src/main.ts': 'один\nдва\nтри\n' });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('конфликтов нет — и сеанса нет', async () => {
    expect(await merge(c, 'state')).toBeNull();
  });

  it('РАСХОЖДЕНИЕ спора не заводит: никто ничем не заблокирован', async () => {
    await diverge();
    expect(await merge(c, 'state')).toBeNull();
    const state = await c.call('doc.state', { path: 'src/main.ts' });
    expect(state.text).toBe('ОДИН\nдва\nтри\n');
    expect(state.dirty).toBe(true);
  });

  it('спор заводит ОТКАЗ СОХРАНЕНИЯ, и предок в нём настоящий', async () => {
    await diverge();

    const waiting = nextState(c, (state) => state !== null);
    await c.expectError('doc.save', { path: 'src/main.ts' });
    const state = await waiting;

    expect(state.source).toBe('fs');
    expect(state.title).toBe('merge.title.fs.save');
    const file = state.files[0]!;
    expect(file.base).toBe('один\nдва\nтри\n');
    expect(file.left.text).toBe('ОДИН\nдва\nтри\n');
    expect(file.right.text).toBe('один\nдва\nТРИ\n');
  });

  it('решение спора о сохранении уезжает НА ДИСК', async () => {
    await diverge();
    await c.expectError('doc.save', { path: 'src/main.ts' });
    await nextState(c, (state) => state !== null);

    const merged = 'ОДИН\nдва\nТРИ\n';
    expect(await merge(c, 'resolve', { path: 'src/main.ts', text: merged })).toBeNull();

    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe(merged);
    const state = await c.call('doc.state', { path: 'src/main.ts' });
    expect(state.text).toBe(merged);
    expect(state.dirty).toBe(false);
  });

  it('решение спора о перезагрузке остаётся В ПАМЯТИ', async () => {
    await diverge();

    const session = await merge(c, 'fromDisk', { path: 'src/main.ts' });
    expect(session?.title).toBe('merge.title.fs.reload');

    const merged = 'ОДИН\nдва\nТРИ\n';
    await merge(c, 'resolve', { path: 'src/main.ts', text: merged });

    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe('один\nдва\nТРИ\n');
    const state = await c.call('doc.state', { path: 'src/main.ts' });
    expect(state.text).toBe(merged);
    expect(state.dirty).toBe(true);
  });

  it('слияние догоняет ревизию: следующее сохранение проходит', async () => {
    await diverge();
    await merge(c, 'fromDisk', { path: 'src/main.ts' });
    await merge(c, 'resolve', { path: 'src/main.ts', text: 'ОДИН\nдва\nТРИ\n' });

    const saved = await c.call('doc.save', { path: 'src/main.ts' });
    expect(saved.dirty).toBe(false);
    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe('ОДИН\nдва\nТРИ\n');
  });

  it('файл удалили снаружи — правки живы, но спора ещё нет', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'моя работа\n',
      baseVersion: doc.version,
    });

    const waiting = c.nextEvent('doc.diverged', 8000, (e) => e.reason === 'removed');
    await fs.rm(path.join(root, 'src', 'main.ts'));
    await waiting;

    expect((await c.call('doc.state', { path: 'src/main.ts' })).text).toBe('моя работа\n');
    expect(await merge(c, 'state')).toBeNull();
  });

  it('сохранение поверх удалённого спрашивает ЯВНО, а не воскрешает молча', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'моя работа\n',
      baseVersion: doc.version,
    });
    const gone = c.nextEvent('doc.diverged', 8000, (e) => e.reason === 'removed');
    await fs.rm(path.join(root, 'src', 'main.ts'));
    await gone;

    const waiting = nextState(c, (state) => state !== null);
    await c.expectError('doc.save', { path: 'src/main.ts' });
    const state = await waiting;

    expect(state.files[0]!.right.text).toBeNull();
    expect(state.files[0]!.left.text).toBe('моя работа\n');
  });

  it('отказ закрывает сеанс и ничего не пишет', async () => {
    await diverge('чужое\n');
    await c.expectError('doc.save', { path: 'src/main.ts' });
    await nextState(c, (state) => state !== null);

    await merge(c, 'cancel');
    expect(await merge(c, 'state')).toBeNull();
    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe('чужое\n');
    expect((await c.call('doc.state', { path: 'src/main.ts' })).text).toBe('ОДИН\nдва\nтри\n');
  });
});
