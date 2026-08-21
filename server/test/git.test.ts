import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../src/server.js';
import { parseStatus } from '../src/git/git-index.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

const run = promisify(execFile);

describe('git', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  async function git(...args: string[]) {
    return run('git', args, { cwd: root });
  }

  beforeEach(async () => {
    server = await withServer();
    root = await makeProject('git', {
      'package.json': JSON.stringify({ name: 'root' }),
      'src/main.ts': 'export const one = 1;\n',
      'src/util.ts': 'export const two = 2;\n',
    });
    await git('init', '-b', 'main');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'user.name', 'Тест');
    await git('add', '.');
    await git('commit', '-m', 'первый');
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('чистый репозиторий: ветка есть, изменений нет', async () => {
    const state = await waitForState(c, (s) => s.repo);
    expect(state.branch).toBe('main');
    expect(state.files).toEqual({});
  });

  it('правка файла видна как изменение, новый файл — как неверсионированный', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n', 'utf8');
    await fs.writeFile(path.join(root, 'src/new.ts'), 'export const three = 3;\n', 'utf8');
    await c.call('git.refresh', null);

    const state = await c.call('git.state', null);
    expect(state.files['src/main.ts']).toBe('modified');
    expect(state.files['src/new.ts']).toBe('untracked');
    expect(state.files['src/util.ts']).toBeUndefined();
  });

  it('состояние отдаётся из памяти, а не считается на запрос', async () => {
    await waitForState(c, (s) => s.repo);
    const started = Date.now();
    for (let i = 0; i < 20; i += 1) await c.call('git.state', null);
    expect(Date.now() - started).toBeLessThan(300);
  });

  it('ветки: текущая помечена, новая появляется и на неё переключаются', async () => {
    await waitForState(c, (s) => s.repo);

    expect((await c.call('git.run', { action: 'create', name: 'feature' })).error).toBeNull();
    const branches = await c.call('git.branches', null);
    expect(branches.map((b) => b.name)).toContain('feature');
    expect(branches.find((b) => b.current)?.name).toBe('feature');

    expect((await c.call('git.run', { action: 'checkout', branch: 'main' })).error).toBeNull();
    expect((await c.call('git.state', null)).branch).toBe('main');

    expect((await c.call('git.run', { action: 'rename', branch: 'feature', name: 'renamed' })).error)
      .toBeNull();
    expect((await c.call('git.branches', null)).map((b) => b.name)).toContain('renamed');

    expect((await c.call('git.run', { action: 'delete', branch: 'renamed' })).error).toBeNull();
    expect((await c.call('git.branches', null)).map((b) => b.name)).not.toContain('renamed');
  }, 20_000);

  it('отказ git приходит его словами, а не нашим пересказом', async () => {
    await waitForState(c, (s) => s.repo);
    const { error } = await c.call('git.run', { action: 'checkout', branch: 'нет-такой' });
    expect(error).toMatch(/did not match|pathspec|not found/i);
  });

  it('имя ветки не может стать флагом git', async () => {
    await waitForState(c, (s) => s.repo);
    const bad = await c.expectError('git.run', { action: 'checkout', branch: '--exec=rm -rf /' });
    expect(bad.message).toMatch(/недопустимое имя ветки/);
    const spaced = await c.expectError('git.run', { action: 'create', name: 'две ветки' });
    expect(spaced.message).toMatch(/недопустимое имя ветки/);
  });

  it('переименование в разборе статуса не съедает следующую запись', () => {
    const raw = 'R  new.ts\0old.ts\0 M src/main.ts\0?? src/fresh.ts\0';
    expect(parseStatus(raw)).toEqual({
      'new.ts': 'modified',
      'src/main.ts': 'modified',
      'src/fresh.ts': 'untracked',
    });
  });
});

async function waitForState(
  client: TestClient,
  match: (state: Awaited<ReturnType<TestClient['call']>> & any) => boolean,
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = await client.call('git.state', null);
    if (match(state)) return state;
    if (Date.now() > deadline) throw new Error(`git не дошёл до нужного состояния`);
    await new Promise((r) => setTimeout(r, 60));
  }
}
