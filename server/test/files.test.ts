import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

describe('a workspace\'s files', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await withServer();
    root = await makeProject('files', {
      'src/main.ts': 'const a = 1;\n',
      'src/util/helper.ts': 'export const h = 1;\n',
      'readme.md': '# hi\n',
      'src/.main.ts.tmp-123-abc': 'rubbish\n',
      'src/main.ts~': 'rubbish\n',
    });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('a temporary file that was there before the open does not reach the tree', async () => {
    const tree = await c.call('tree.list', { path: 'src' });
    expect(tree.map((entry) => entry.name).sort()).toEqual(['main.ts', 'util']);
  });

  it('the tree hands over directories first, with relative paths', async () => {
    const entries = await c.call('fs.list', { path: '' });
    expect(entries.map((e) => e.name)).toEqual(['src', 'readme.md']);
    expect(entries[0]).toMatchObject({ kind: 'dir', path: 'src' });
    expect(entries[1]).toMatchObject({ kind: 'file', path: 'readme.md' });
  });

  it('nested paths travel with a forward slash on any OS', async () => {
    const file = await c.call('fs.read', { path: 'src/util/helper.ts' });
    expect(file.path).toBe('src/util/helper.ts');
    expect(file.text).toBe('export const h = 1;\n');
  });

  it('a write returns a new revision and really does change the file', async () => {
    const before = await c.call('fs.read', { path: 'src/main.ts' });
    const result = await c.call('fs.write', {
      path: 'src/main.ts',
      text: 'const a = 2;\n',
      expectedRevision: before.revision,
    });
    expect(result.revision).not.toBe(before.revision);
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('const a = 2;\n');
  });

  it('somebody else\'s edit on disk is not overwritten silently', async () => {
    const before = await c.call('fs.read', { path: 'src/main.ts' });
    await new Promise((r) => setTimeout(r, 10));
    await fs.writeFile(path.join(root, 'src/main.ts'), 'an external formatter\n', 'utf8');

    const err = await c.expectError('fs.write', {
      path: 'src/main.ts',
      text: 'our version\n',
      expectedRevision: before.revision,
    });
    expect(err.code).toBe(1006);
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('an external formatter\n');
  });

  it('creates a file along with the missing directories', async () => {
    await c.call('fs.write', { path: 'a/b/c.ts', text: 'x\n', expectedRevision: null });
    expect(await fs.readFile(path.join(root, 'a/b/c.ts'), 'utf8')).toBe('x\n');
  });

  it('lets nothing past the project root, neither for reading nor for writing', async () => {
    expect((await c.expectError('fs.read', { path: '../../etc/passwd' })).code).toBe(1002);
    expect((await c.expectError('fs.list', { path: '/etc' })).code).toBe(1002);
    expect(
      (await c.expectError('fs.write', { path: '../beda.txt', text: 'x' })).code,
    ).toBe(1002);
  });

  it('tells a missing path from one of the wrong kind', async () => {
    expect((await c.expectError('fs.read', { path: 'no-such.ts' })).code).toBe(1004);
    expect((await c.expectError('fs.read', { path: 'src' })).code).toBe(1005);
  });
});
