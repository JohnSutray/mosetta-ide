import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

describe('операции с деревом', () => {
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

  it('создаёт файл и папку, но не поверх существующего', async () => {
    const file = await c.call('fs.create', { path: 'src/new.ts', kind: 'file' });
    expect(file).toMatchObject({ path: 'src/new.ts', kind: 'file', size: 0 });

    const dir = await c.call('fs.create', { path: 'src/parts', kind: 'dir' });
    expect(dir).toMatchObject({ path: 'src/parts', kind: 'dir' });

    const again = await c.expectError('fs.create', { path: 'src/main.ts', kind: 'file' });
    expect(again.message).toMatch(/Уже есть/);
  });

  it('переименование и перемещение — одна операция', async () => {
    const moved = await c.call('fs.move', { from: 'src/main.ts', to: 'src/util/renamed.ts' });
    expect(moved.path).toBe('src/util/renamed.ts');
    await expect(fs.stat(path.join(root, 'src/main.ts'))).rejects.toThrow();
    expect((await fs.readFile(path.join(root, 'src/util/renamed.ts'), 'utf8'))).toContain('one');
  });

  it('копирует папку целиком', async () => {
    await c.call('fs.copy', { from: 'src/util', to: 'src/util-copy' });
    expect(await fs.readFile(path.join(root, 'src/util-copy/helper.ts'), 'utf8')).toContain('h = 1');
  });

  it('удаляет файл и папку, но не корень проекта', async () => {
    await c.call('fs.remove', { path: 'src/util' });
    await expect(fs.stat(path.join(root, 'src/util'))).rejects.toThrow();

    const root_ = await c.expectError('fs.remove', { path: '' });
    expect(root_.message).toMatch(/корень/);
  });

  it('за корень проекта не выпускает', async () => {
    const out = await c.expectError('fs.move', { from: 'src/main.ts', to: '../beda.ts' });
    expect(out.code).toBeTruthy();
    const created = await c.expectError('fs.create', { path: '../../beda.ts', kind: 'file' });
    expect(created.code).toBeTruthy();
  });

  it('кладёт байты из буфера обмена', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const made = await c.call('fs.writeBytes', { path: 'src/image_1.png', base64: png });
    expect(made.path).toBe('src/image_1.png');
    const bytes = await fs.readFile(path.join(root, 'src/image_1.png'));
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  });

  it('отдаёт байты файла — и говорит, если отдал не весь', async () => {
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

    const missing = await c.expectError('fs.bytes', { path: 'нет-такого.png' });
    expect(missing.code).toBeTruthy();
  });
});
