import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  declaredOf,
  type CallContext,
  type CommandHandler,
  type Ide,
  type Project,
  type ProjectResource,
  type RunAsk,
  type RunResult,
} from '@ide/api/server';
import GitServer from '../src/server.js';
import { GitStatus } from '../src/status.js';
import type { GitBranch, GitChange, GitState, PushPreview } from '../src/types.js';

const run = promisify(execFile);

class FakeProject implements Project {
  readonly heard: Array<{ event: string; payload: unknown }> = [];
  private readonly resources = new Map<string, ProjectResource>();
  constructor(readonly root: string) {}
  readonly name = 'проект';
  use<T extends ProjectResource>(key: string, create: () => T): T {
    const have = this.resources.get(key);
    if (have) return have as T;
    const made = create();
    this.resources.set(key, made);
    return made;
  }
  emit(event: string, payload: unknown): void {
    this.heard.push({ event, payload });
  }
  hold(): () => void {
    return () => undefined;
  }
  resolve(relative: string): string {
    return path.join(this.root, relative);
  }
  spawned(): () => void {
    return () => undefined;
  }
  async dispose(): Promise<void> {
    for (const one of this.resources.values()) await one.dispose();
  }
}

function running(spec: RunAsk, onChunk?: (text: string) => void): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: { ...process.env, LC_ALL: 'C', ...spec.env } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
      onChunk?.(d.toString());
    });
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString();
      onChunk?.(d.toString());
    });
    child.on('close', (code) =>
      resolve({ ok: code === 0, stdout: out, stderr: err.trim(), code, timedOut: false, truncated: false }),
    );
    child.on('error', (e) =>
      resolve({ ok: false, stdout: out, stderr: e.message, code: null, timedOut: false, truncated: false }),
    );
  });
}

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function fakeIde(): Ide {
  return {
    name: '@ide/plugin-git',
    method: () => undefined,
    getPlugin: () => {
      throw new Error('соседей в этом тесте нет');
    },
    find: () => undefined,
    settings: () => {
      throw new Error('настроек в этом тесте нет');
    },
    environment: () => ({}),
    which: () => null,
    state: '',
    run: (ask) => running(ask),
    stream: (ask, onChunk) => running(ask, onChunk),
    log: silent,
  };
}

describe('git', () => {
  let root: string;
  let project: FakeProject;
  let call: (method: string, params?: unknown) => Promise<unknown>;

  async function git(...args: string[]) {
    return run('git', args, { cwd: root });
  }

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ide-git-')));
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'root' }));
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 1;\n');
    await fs.writeFile(path.join(root, 'src/util.ts'), 'export const two = 2;\n');
    await git('init', '-b', 'main');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'user.name', 'Тест');
    await git('add', '.');
    await git('commit', '-m', 'первый');

    project = new FakeProject(root);
    const server = new GitServer(fakeIde());
    const methods = new Map<string, CommandHandler>(declaredOf(server));
    const ctx: CallContext = { project, services: null };
    call = (method, params = null) => {
      const handler = methods.get(method);
      if (!handler) throw new Error(`нет метода ${method}`);
      return Promise.resolve(handler(params, ctx));
    };
  });

  afterEach(async () => {
    await project.dispose();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  const state = () => call('state') as Promise<GitState>;
  const branches = () => call('branches') as Promise<GitBranch[]>;
  const outgoing = () => call('outgoing') as Promise<PushPreview>;
  const changes = (p: { commit?: string } = {}) => call('changes', p) as Promise<GitChange[]>;
  const act = (p: { action: string; branch?: string; name?: string }) =>
    call('run', p) as Promise<{ error: string | null }>;

  it('чистый репозиторий: ветка есть, изменений нет', async () => {
    const fresh = (await call('refresh')) as GitState;
    expect(fresh.repo).toBe(true);
    expect(fresh.branch).toBe('main');
    expect(fresh.files).toEqual({});
  });

  it('правка файла видна как изменение, новый файл — как неверсионированный', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    await fs.writeFile(path.join(root, 'src/new.ts'), 'export const three = 3;\n');
    const got = (await call('refresh')) as GitState;
    expect(got.files['src/main.ts']).toBe('modified');
    expect(got.files['src/new.ts']).toBe('untracked');
    expect(got.files['src/util.ts']).toBeUndefined();
  });

  it('отдаёт файл таким, каким он был в коммите', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 999;\n');
    const head = (await call('head', { path: 'src/main.ts' })) as { path: string; text: string | null };
    expect(head.path).toBe('src/main.ts');
    expect(head.text).toBe('export const one = 1;\n');
  });

  it('файла нет в истории — это ответ, а не ошибка', async () => {
    await fs.writeFile(path.join(root, 'src/fresh.ts'), 'export const three = 3;\n');
    const head = (await call('head', { path: 'src/fresh.ts' })) as { text: string | null };
    expect(head.text).toBeNull();
  });

  it('состояние отдаётся из памяти, а не считается на запрос', async () => {
    await call('refresh');
    const started = Date.now();
    for (let i = 0; i < 20; i += 1) await state();
    expect(Date.now() - started).toBeLessThan(300);
  });

  it('ветки: текущая помечена, новая появляется и на неё переключаются', async () => {
    await call('refresh');
    expect((await act({ action: 'create', name: 'feature' })).error).toBeNull();
    let list = await branches();
    expect(list.map((b) => b.name)).toContain('feature');
    expect(list.find((b) => b.current)?.name).toBe('feature');

    expect((await act({ action: 'checkout', branch: 'main' })).error).toBeNull();
    expect((await state()).branch).toBe('main');

    expect((await act({ action: 'rename', branch: 'feature', name: 'renamed' })).error).toBeNull();
    list = await branches();
    expect(list.map((b) => b.name)).toContain('renamed');

    expect((await act({ action: 'delete', branch: 'renamed' })).error).toBeNull();
    expect((await branches()).map((b) => b.name)).not.toContain('renamed');
  }, 20_000);

  it('действие печатает свой вывод, а не молчит до конца', async () => {
    await call('refresh');
    await act({ action: 'create', name: 'streamed' });
    const chunks = project.heard
      .filter((one) => one.event === 'output')
      .map((one) => one.payload as { action: string; chunk: string });
    const text = chunks.map((one) => one.chunk).join('');
    expect(text).toContain('$ git checkout -b streamed');
    expect(text).toContain('[готово]');
    expect(chunks.every((one) => one.action === 'create')).toBe(true);
  }, 15_000);

  it('отказ git приходит его словами, а не нашим пересказом', async () => {
    await call('refresh');
    const { error } = await act({ action: 'checkout', branch: 'нет-такой' });
    expect(error).toMatch(/did not match|pathspec|not found/i);
  });

  it('имя ветки не может стать флагом git', async () => {
    await expect(act({ action: 'checkout', branch: '--exec=rm -rf /' })).rejects.toThrow(
      /недопустимое имя ветки/,
    );
    await expect(act({ action: 'create', name: 'две ветки' })).rejects.toThrow(
      /недопустимое имя ветки/,
    );
  });

  it('окно пуша знает, что уедет и что затрётся', async () => {
    await call('refresh');
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-bare-'));
    await run('git', ['init', '--bare', '-b', 'main', bare]);
    await git('remote', 'add', 'origin', bare);
    await git('push', '-u', 'origin', 'main');

    await fs.writeFile(path.join(root, 'src/mine.ts'), 'export const mine = 1;\n');
    await git('add', '.');
    await git('commit', '-m', 'моё');

    let preview = await outgoing();
    expect(preview.branch).toBe('main');
    expect(preview.upstream).toBe('origin/main');
    expect(preview.local.map((c) => c.subject)).toEqual(['моё']);
    expect(preview.remote).toEqual([]);
    expect(preview.common.map((c) => c.subject)).toEqual(['первый']);

    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-other-'));
    await run('git', ['clone', bare, other]);
    await run('git', ['-C', other, 'config', 'user.email', 'other@example.com']);
    await run('git', ['-C', other, 'config', 'user.name', 'Другой']);
    await fs.writeFile(path.join(other, 'theirs.ts'), 'export const theirs = 1;\n');
    await run('git', ['-C', other, 'add', '.']);
    await run('git', ['-C', other, 'commit', '-m', 'чужое']);
    await run('git', ['-C', other, 'push']);

    await act({ action: 'fetch' });
    preview = await outgoing();
    expect(preview.local.map((c) => c.subject)).toEqual(['моё']);
    expect(preview.remote.map((c) => c.subject)).toEqual(['чужое']);

    await fs.rm(bare, { recursive: true, force: true });
    await fs.rm(other, { recursive: true, force: true });
  }, 30_000);

  it('файлы пуша: весь исходящий дифф и дифф одного коммита', async () => {
    await call('refresh');
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-bare2-'));
    await run('git', ['init', '--bare', '-b', 'main', bare]);
    await git('remote', 'add', 'origin', bare);
    await git('push', '-u', 'origin', 'main');

    await fs.writeFile(path.join(root, 'src/one.ts'), 'export const one = 1;\n');
    await git('add', '.');
    await git('commit', '-m', 'первый мой');
    await fs.writeFile(path.join(root, 'src/two.ts'), 'export const two = 2;\n');
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    await git('add', '.');
    await git('commit', '-m', 'второй мой');

    const all = await changes();
    expect(all.map((c) => c.path).sort()).toEqual(['src/main.ts', 'src/one.ts', 'src/two.ts']);
    expect(all.find((c) => c.path === 'src/main.ts')?.state).toBe('modified');
    expect(all.find((c) => c.path === 'src/one.ts')?.state).toBe('added');

    const preview = await outgoing();
    const older = preview.local[preview.local.length - 1]!;
    expect(older.subject).toBe('первый мой');
    const one = await changes({ commit: older.short });
    expect(one.map((c) => c.path)).toEqual(['src/one.ts']);

    await fs.rm(bare, { recursive: true, force: true });
  }, 30_000);

  it('переименование в разборе статуса не съедает следующую запись', () => {
    const raw = 'R  new.ts\0old.ts\0 M src/main.ts\0?? src/fresh.ts\0';
    expect(new GitStatus().parse(raw)).toEqual({
      'new.ts': 'modified',
      'src/main.ts': 'modified',
      'src/fresh.ts': 'untracked',
    });
  });
});
