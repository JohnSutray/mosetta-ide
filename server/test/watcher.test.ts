import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, type RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, type TestClient } from './helpers.js';

const CONFIG = fileURLToPath(new URL('./fixtures/config-watch', import.meta.url));

describe('слежение за диском', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await startServer({ port: 0, idleMs: 60_000, configDir: CONFIG, watchConfig: false });
    root = await makeProject('watch', {
      'src/main.ts': 'const a = 1;\n',
      'readme.md': '# hi\n',
    });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('новый файл появляется в памяти сам', async () => {
    const waiting = treeChanged(c, 'src');
    await fs.writeFile(path.join(root, 'src', 'added.ts'), 'export const x = 1;\n', 'utf8');
    await waiting;

    const tree = await c.call('tree.list', { path: 'src' });
    expect(tree.map((e) => e.name)).toContain('added.ts');
  });

  it('новый файл сразу ищется индексом', async () => {
    const waiting = treeChanged(c, 'src');
    await fs.writeFile(path.join(root, 'src', 'находка.ts'), 'export const y = 1;\n', 'utf8');
    await waiting;

    const hits = await c.call('index.search', { query: 'находка' });
    expect(hits.map((h) => h.path)).toContain('src/находка.ts');
  });

  it('удалённый файл уходит из памяти', async () => {
    const waiting = treeChanged(c, '');
    await fs.rm(path.join(root, 'readme.md'));
    await waiting;

    const tree = await c.call('tree.list', { path: '' });
    expect(tree.map((e) => e.name)).not.toContain('readme.md');
  });

  it('новая папка обходится целиком', async () => {
    const waiting = treeChanged(c, 'src/deep');
    await fs.mkdir(path.join(root, 'src', 'deep', 'nested'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'deep', 'nested', 'far.ts'), 'export {};\n', 'utf8');
    await waiting;
    await settle();

    const hits = await c.call('index.search', { query: 'far' });
    expect(hits.map((h) => h.path)).toContain('src/deep/nested/far.ts');
  });

  it('удалённая папка уносит поддерево', async () => {
    await fs.mkdir(path.join(root, 'src', 'temp'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'temp', 'inner.ts'), 'export {};\n', 'utf8');
    await treeChanged(c, 'src/temp');
    await settle();
    expect((await c.call('index.search', { query: 'inner' })).length).toBeGreaterThan(0);

    await fs.rm(path.join(root, 'src', 'temp'), { recursive: true, force: true });
    await treeChanged(c, 'src');
    await settle();

    expect(await c.call('index.search', { query: 'inner' })).toEqual([]);
  });

  it('чужая правка подтягивается, пока в памяти чисто', async () => {
    await c.call('doc.open', { path: 'src/main.ts' });
    const waiting = c.nextEvent('doc.external', 5000);

    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'const a = 99;\n', 'utf8');
    await waiting;

    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    expect(doc.text).toBe('const a = 99;\n');
    expect(doc.dirty).toBe(false);
  });

  it('чужая правка поверх несохранённого — конфликт, а не потеря', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', { path: 'src/main.ts', text: 'наше\n', baseVersion: doc.version });

    const waiting = c.nextEvent('doc.conflict', 5000);
    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'чужое\n', 'utf8');
    await waiting;

    const after = await c.call('doc.open', { path: 'src/main.ts' });
    expect(after.text).toBe('наше\n');
    expect(after.dirty).toBe(true);
  });

  it('исчезнувший открытый документ объявляется удалённым', async () => {
    await c.call('doc.open', { path: 'src/main.ts' });
    const waiting = c.nextEvent('doc.removed', 5000);
    await fs.rm(path.join(root, 'src', 'main.ts'));
    expect(await waiting).toMatchObject({ path: 'src/main.ts' });
  });

  it('собственное сохранение не считается чужой правкой', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', { path: 'src/main.ts', text: 'своё\n', baseVersion: doc.version });
    await c.call('doc.save', { path: 'src/main.ts' });
    await settle(300);

    expect(c.events('doc.conflict')).toEqual([]);
    expect(c.events('doc.external')).toEqual([]);
  });

  it('возня в node_modules память не тревожит', async () => {
    await fs.mkdir(path.join(root, 'node_modules', 'left-pad'), { recursive: true });
    await treeChanged(c, '');
    await settle();

    const before = c.events('tree.changed').length;
    for (let i = 0; i < 20; i += 1) {
      await fs.writeFile(
        path.join(root, 'node_modules', 'left-pad', `f${i}.js`),
        'module.exports = 1;\n',
        'utf8',
      );
    }
    await settle(300);

    expect(c.events('tree.changed').length).toBe(before);
    expect((await c.call('tree.stats', null)).files).toBe(2);
  });

  it('файл, созданный через fs.create, память видит сама', async () => {
    await c.call('fs.create', { path: 'src/fresh.ts', kind: 'file' });
    await treeChanged(c, 'src');
    const tree = await c.call('tree.list', { path: 'src' });
    expect(tree.map((entry) => entry.name)).toContain('fresh.ts');
  }, 15_000);

  it('временные файлы редакторов не всплывают', async () => {
    await fs.writeFile(path.join(root, 'src', '.main.ts.tmp-123-abc'), 'мусор\n', 'utf8');
    await fs.writeFile(path.join(root, 'src', 'main.ts~'), 'мусор\n', 'utf8');
    await settle(300);

    const tree = await c.call('tree.list', { path: 'src' });
    expect(tree.map((e) => e.name)).toEqual(['main.ts']);
  });
});

function treeChanged(client: TestClient, dir: string): Promise<unknown> {
  return client.nextEvent('tree.changed', 5000, (p) => p?.path === dir);
}

function settle(ms = 150): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
