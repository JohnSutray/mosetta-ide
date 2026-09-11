import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

interface Hit {
  kind: string;
  label: string;
  path: string;
  line?: number;
  matches: number[];
}
function search(c: TestClient, params: { query: string; limit?: number; kinds?: string[] }): Promise<Hit[]> {
  return c.call('plugins.call', { name: '@mosetta/ide-plugin-search', method: 'search', params }) as Promise<Hit[]>;
}

describe('RAM FS', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await withServer();
    root = await makeProject('ram', {
      'src/main.ts': 'const a = 1;\n',
      'src/util/helper.ts': 'export const h = 1;\n',
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

  it('дерево обошли жадно при открытии проекта', async () => {
    const stats = await c.call('tree.stats', null);
    expect(stats.files).toBe(3);
    expect(stats.dirs).toBe(3);
  });

  it('tree.list читает память, fs.list читает диск — и это видно', async () => {
    await fs.writeFile(path.join(root, 'src', 'sneaky.ts'), 'export const s = 1;\n', 'utf8');

    const fromDisk = await c.call('fs.list', { path: 'src' });
    const fromMemory = await c.call('tree.list', { path: 'src' });

    expect(fromDisk.map((e) => e.name)).toContain('sneaky.ts');
    expect(fromMemory.map((e) => e.name)).not.toContain('sneaky.ts');
  });

  it('node_modules показывается, но жадно не обходится', async () => {
    await fs.mkdir(path.join(root, 'node_modules', 'left-pad'), { recursive: true });
    await fs.writeFile(path.join(root, 'node_modules', 'left-pad', 'index.js'), 'x\n', 'utf8');

    const fresh = await withServer();
    const cc = await connect(fresh);
    await cc.call('workspace.open', { root });

    const top = await cc.call('tree.list', { path: '' });
    const nm = top.find((e) => e.name === 'node_modules');
    expect(nm?.noScan).toBe(true);

    const stats = await cc.call('tree.stats', null);
    expect(stats.files).toBe(3);

    const inside = await cc.call('tree.list', { path: 'node_modules' });
    expect(inside.map((e) => e.name)).toEqual(['left-pad']);

    await cc.close();
    await fresh.close();
  });

  it('правка живёт в памяти и на диск не течёт', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    expect(doc.version).toBe(0);
    expect(doc.dirty).toBe(false);

    const edited = await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'const a = 2;\n',
      baseVersion: doc.version,
    });
    expect(edited.version).toBe(1);
    expect(edited.dirty).toBe(true);

    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('const a = 1;\n');

    await c.call('doc.save', { path: 'src/main.ts' });
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('const a = 2;\n');
  });

  it('правка на устаревшую версию отвергается', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', { path: 'src/main.ts', text: 'x\n', baseVersion: doc.version });

    const err = await c.expectError('doc.edit', {
      path: 'src/main.ts',
      text: 'y\n',
      baseVersion: doc.version,
    });
    expect(err.code).toBe(1009);
  });

  it('чужая запись подхватывается, пока в памяти чисто', async () => {
    await c.call('doc.open', { path: 'src/main.ts' });
    const waiting = c.nextEvent('doc.external');

    await c.call('fs.write', { path: 'src/main.ts', text: 'внешний\n', expectedRevision: null });

    await waiting;
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    expect(doc.text).toBe('внешний\n');
    expect(doc.dirty).toBe(false);
  });

  it('чужая запись поверх несохранённого — расхождение, а не тихая потеря', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', { path: 'src/main.ts', text: 'наше\n', baseVersion: doc.version });

    const waiting = c.nextEvent('doc.diverged');
    await c.call('fs.write', { path: 'src/main.ts', text: 'чужое\n', expectedRevision: null });
    await waiting;

    const after = await c.call('doc.open', { path: 'src/main.ts' });
    expect(after.text).toBe('наше\n');
    expect(after.dirty).toBe(true);

    const reloaded = await c.call('doc.reload', { path: 'src/main.ts' });
    expect(reloaded.text).toBe('чужое\n');
    expect(reloaded.dirty).toBe(false);
  });

  it('индекс ищет по памяти', async () => {
    const hits = await search(c, { query: 'helper' });
    expect(hits[0]?.path).toBe('src/util/helper.ts');

    const fuzzy = await search(c, { query: 'srmn' });
    expect(fuzzy.map((h) => h.path)).toContain('src/main.ts');
  });
});

describe('флаг «изменён» говорит правду', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await withServer();
    root = await makeProject('dirty', { 'a.ts': 'const a = 1;\n' });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('вернул текст как был — метка гаснет, хотя правки были', async () => {
    const doc = await c.call('doc.open', { path: 'a.ts' });

    const changed = await c.call('doc.edit', {
      path: 'a.ts',
      text: 'const a = 2;\n',
      baseVersion: doc.version,
    });
    expect(changed.dirty).toBe(true);

    const back = await c.call('doc.edit', {
      path: 'a.ts',
      text: 'const a = 1;\n',
      baseVersion: changed.version,
    });
    expect(back.dirty).toBe(false);
    expect(back.version).toBe(2);
  });
});
