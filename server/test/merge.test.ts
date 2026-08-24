import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

const CONFIG = fileURLToPath(new URL('./fixtures/config-watch', import.meta.url));

describe('слияние', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

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
    expect(await c.call('merge.state', null)).toBeNull();
  });

  it('диск разошёлся с памятью — сеанс заводится сам, с общим предком', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'ОДИН\nдва\nтри\n',
      baseVersion: doc.version,
    });

    const waiting = c.nextEvent('merge.state', 8000, (state) => state !== null);
    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'один\nдва\nТРИ\n', 'utf8');
    const state = await waiting;

    expect(state.source).toBe('fs');
    expect(state.files).toHaveLength(1);
    const file = state.files[0];
    expect(file.path).toBe('src/main.ts');
    expect(file.base).toBe('один\nдва\nтри\n');
    expect(file.left.text).toBe('ОДИН\nдва\nтри\n');
    expect(file.right.text).toBe('один\nдва\nТРИ\n');
    expect(file.done).toBe(false);
  });

  it('подтверждение доезжает и до диска, и до памяти', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'ОДИН\nдва\nтри\n',
      baseVersion: doc.version,
    });
    const waiting = c.nextEvent('merge.state', 8000, (state) => state !== null);
    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'один\nдва\nТРИ\n', 'utf8');
    await waiting;

    const merged = 'ОДИН\nдва\nТРИ\n';
    const after = await c.call('merge.resolve', { path: 'src/main.ts', text: merged });
    expect(after).toBeNull();
    expect(await c.call('merge.state', null)).toBeNull();

    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe(merged);
    const state = await c.call('doc.state', { path: 'src/main.ts' });
    expect(state.text).toBe(merged);
    expect(state.dirty).toBe(false);
  });

  it('файл удалили снаружи, а правки живы — это спор, а не похороны', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'моя работа\n',
      baseVersion: doc.version,
    });

    const waiting = c.nextEvent('merge.state', 8000, (state) => state !== null);
    await fs.rm(path.join(root, 'src', 'main.ts'));
    const state = await waiting;

    const file = state.files[0];
    expect(file.right.text).toBeNull();
    expect(file.left.text).toBe('моя работа\n');
    expect((await c.call('doc.state', { path: 'src/main.ts' })).text).toBe('моя работа\n');
  });

  it('удаление можно принять — и тогда файла не станет', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'моя работа\n',
      baseVersion: doc.version,
    });
    const waiting = c.nextEvent('merge.state', 8000, (state) => state !== null);
    await fs.rm(path.join(root, 'src', 'main.ts'));
    await waiting;

    const gone = c.nextEvent('doc.removed', 8000);
    await c.call('merge.resolve', { path: 'src/main.ts', text: null });
    await gone;

    await expect(fs.stat(path.join(root, 'src', 'main.ts'))).rejects.toThrow();
    expect(await c.call('merge.state', null)).toBeNull();
  });

  it('можно оставить свою версию — файл вернётся на диск', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'моя работа\n',
      baseVersion: doc.version,
    });
    const waiting = c.nextEvent('merge.state', 8000, (state) => state !== null);
    await fs.rm(path.join(root, 'src', 'main.ts'));
    await waiting;

    await c.call('merge.resolve', { path: 'src/main.ts', text: 'моя работа\n' });
    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe('моя работа\n');
  });

  it('второй конфликт попадает в ТОТ ЖЕ сеанс, а не заводит второй экран', async () => {
    for (const name of ['a.ts', 'b.ts']) {
      await fs.writeFile(path.join(root, 'src', name), 'база\n', 'utf8');
    }
    await c.nextEvent('tree.changed', 8000, (event) => event.path === 'src');

    for (const name of ['a.ts', 'b.ts']) {
      const doc = await c.call('doc.open', { path: `src/${name}` });
      await c.call('doc.edit', {
        path: `src/${name}`,
        text: 'моё\n',
        baseVersion: doc.version,
      });
    }

    for (const name of ['a.ts', 'b.ts']) {
      const waiting = c.nextEvent(
        'merge.state',
        8000,
        (state) => state?.files.some((f: { path: string }) => f.path === `src/${name}`) ?? false,
      );
      await fs.writeFile(path.join(root, 'src', name), 'чужое\n', 'utf8');
      await waiting;
    }

    const state = await c.call('merge.state', null);
    expect(state?.files.map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);

    const rest = await c.call('merge.resolve', { path: 'src/a.ts', text: 'решено\n' });
    expect(rest?.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(rest?.files.find((f) => f.path === 'src/a.ts')?.done).toBe(true);
  });

  it('отказ закрывает сеанс', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'моё\n',
      baseVersion: doc.version,
    });
    const waiting = c.nextEvent('merge.state', 8000, (state) => state !== null);
    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'чужое\n', 'utf8');
    await waiting;

    await c.call('merge.cancel', null);
    expect(await c.call('merge.state', null)).toBeNull();
    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe('чужое\n');
    expect((await c.call('doc.state', { path: 'src/main.ts' })).text).toBe('моё\n');
  });
});
