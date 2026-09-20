import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

/**
 * Tree operations. We check the promises rather than the calls to fs: creating over
 * something existing is not allowed, moving outside the root is not allowed, deleting
 * the root is not allowed at all, and memory learns about everything by itself —
 * through the watcher, as about any edit from outside.
 */
describe('tree operations', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await withServer();
    root = await makeProject('ops', {
      'src/main.ts': 'export const one = 1;\n',
      'src/util/helper.ts': 'export const h = 1;\n',
    });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('creates a file and a directory, but not over something existing', async () => {
    const file = await c.call('fs.create', { path: 'src/new.ts', kind: 'file' });
    expect(file).toMatchObject({ path: 'src/new.ts', kind: 'file', size: 0 });

    const dir = await c.call('fs.create', { path: 'src/parts', kind: 'dir' });
    expect(dir).toMatchObject({ path: 'src/parts', kind: 'dir' });

    const again = await c.expectError('fs.create', { path: 'src/main.ts', kind: 'file' });
    expect(again.message).toMatch(/Already there/);
  });

  it('renaming and moving are one operation', async () => {
    const moved = await c.call('fs.move', { from: 'src/main.ts', to: 'src/util/renamed.ts' });
    expect(moved.path).toBe('src/util/renamed.ts');
    await expect(fs.stat(path.join(root, 'src/main.ts'))).rejects.toThrow();
    expect((await fs.readFile(path.join(root, 'src/util/renamed.ts'), 'utf8'))).toContain('one');
  });

  it('copies a directory whole', async () => {
    await c.call('fs.copy', { from: 'src/util', to: 'src/util-copy' });
    expect(await fs.readFile(path.join(root, 'src/util-copy/helper.ts'), 'utf8')).toContain('h = 1');
  });

  it('deletes a file and a directory, but not the project root', async () => {
    await c.call('fs.remove', { path: 'src/util' });
    await expect(fs.stat(path.join(root, 'src/util'))).rejects.toThrow();

    const root_ = await c.expectError('fs.remove', { path: '' });
    expect(root_.message).toMatch(/root/);
  });

  it('lets nothing out past the project root', async () => {
    const out = await c.expectError('fs.move', { from: 'src/main.ts', to: '../beda.ts' });
    expect(out.code).toBeTruthy();
    const created = await c.expectError('fs.create', { path: '../../beda.ts', kind: 'file' });
    expect(created.code).toBeTruthy();
  });

  it('puts down bytes from the clipboard', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const made = await c.call('fs.writeBytes', { path: 'src/image_1.png', base64: png });
    expect(made.path).toBe('src/image_1.png');
    const bytes = await fs.readFile(path.join(root, 'src/image_1.png'));
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  });

  /**
   * The third layer of reading a file: bytes on demand, past memory. The first layer is
   * which files exist, the second is text read greedily; an image is not text and does
   * not live in memory, yet sometimes it has to be shown.
   */
  it('hands over a file\'s bytes — and says so if it handed over less than all of them', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await c.call('fs.writeBytes', { path: 'shot.png', base64: png });

    const whole = await c.call('fs.bytes', { path: 'shot.png' });
    expect(whole.base64).toBe(png);
    expect(whole.truncated).toBe(false);
    expect(whole.bytes).toBe(Buffer.from(png, 'base64').length);

    const part = await c.call('fs.bytes', { path: 'shot.png', limit: 8 });
    expect(part.truncated).toBe(true);
    expect(Buffer.from(part.base64, 'base64')).toHaveLength(8);
    expect(part.bytes).toBe(whole.bytes);

    const missing = await c.expectError('fs.bytes', { path: 'no-such.png' });
    expect(missing.code).toBeTruthy();
  });
});
