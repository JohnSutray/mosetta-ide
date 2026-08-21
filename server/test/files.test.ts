import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

describe('файлы воркспейса', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await withServer();
    root = await makeProject('files', {
      'src/main.ts': 'const a = 1;\n',
      'src/util/helper.ts': 'export const h = 1;\n',
      'readme.md': '# hi\n',
      'src/.main.ts.tmp-123-abc': 'мусор\n',
      'src/main.ts~': 'мусор\n',
    });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('временный файл, лежавший до открытия, в дерево не попадает', async () => {
    const tree = await c.call('tree.list', { path: 'src' });
    expect(tree.map((entry) => entry.name).sort()).toEqual(['main.ts', 'util']);
  });

  it('дерево отдаёт папки сверху, пути относительные', async () => {
    const entries = await c.call('fs.list', { path: '' });
    expect(entries.map((e) => e.name)).toEqual(['src', 'readme.md']);
    expect(entries[0]).toMatchObject({ kind: 'dir', path: 'src' });
    expect(entries[1]).toMatchObject({ kind: 'file', path: 'readme.md' });
  });

  it('вложенные пути ходят со слэшем на любой ОС', async () => {
    const file = await c.call('fs.read', { path: 'src/util/helper.ts' });
    expect(file.path).toBe('src/util/helper.ts');
    expect(file.text).toBe('export const h = 1;\n');
  });

  it('запись возвращает новую ревизию и правда меняет файл', async () => {
    const before = await c.call('fs.read', { path: 'src/main.ts' });
    const result = await c.call('fs.write', {
      path: 'src/main.ts',
      text: 'const a = 2;\n',
      expectedRevision: before.revision,
    });
    expect(result.revision).not.toBe(before.revision);
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('const a = 2;\n');
  });

  it('чужая правка на диске не затирается молча', async () => {
    const before = await c.call('fs.read', { path: 'src/main.ts' });
    await new Promise((r) => setTimeout(r, 10));
    await fs.writeFile(path.join(root, 'src/main.ts'), 'внешний форматтер\n', 'utf8');

    const err = await c.expectError('fs.write', {
      path: 'src/main.ts',
      text: 'наша версия\n',
      expectedRevision: before.revision,
    });
    expect(err.code).toBe(1006);
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('внешний форматтер\n');
  });

  it('создаёт файл вместе с недостающими папками', async () => {
    await c.call('fs.write', { path: 'a/b/c.ts', text: 'x\n', expectedRevision: null });
    expect(await fs.readFile(path.join(root, 'a/b/c.ts'), 'utf8')).toBe('x\n');
  });

  it('за корень проекта не пускает ни на чтение, ни на запись', async () => {
    expect((await c.expectError('fs.read', { path: '../../etc/passwd' })).code).toBe(1002);
    expect((await c.expectError('fs.list', { path: '/etc' })).code).toBe(1002);
    expect(
      (await c.expectError('fs.write', { path: '../beda.txt', text: 'x' })).code,
    ).toBe(1002);
  });

  it('несуществующее и не-того-типа различает', async () => {
    expect((await c.expectError('fs.read', { path: 'нет.ts' })).code).toBe(1004);
    expect((await c.expectError('fs.read', { path: 'src' })).code).toBe(1005);
  });
});
