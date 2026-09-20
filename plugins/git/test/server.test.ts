import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  declaredOf,
  hooksOf,
  type CallContext,
  type CommandHandler,
  type Ide,
  type MemoryEvent,
  type Project,
  type ProcessHandle,
  type ProjectMemory,
  type ProjectResource,
  type RunAsk,
  type RunResult,
} from '@mosetta/ide-api/server';
import GitServer from '../src/server.js';
import { GitStatus } from '../src/status.js';
import type { GitBranch, GitChange, GitState, PushPreview } from '../src/types.js';

const run = promisify(execFile);

/** A decoy project: it remembers the resources and everything it was told. */
class FakeProject implements Project {
  readonly heard: Array<{ event: string; payload: unknown }> = [];
  private readonly resources = new Map<string, ProjectResource>();
  constructor(readonly root: string) {}
  readonly name = 'a project';
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
  settings<T extends object>(_section: string, defaults: T): T {
    return defaults;
  }
  spawned(): () => void {
    return () => undefined;
  }
  start(): ProcessHandle {
    throw new Error('there are no long-lived processes in this test');
  }
  readonly listeners = new Set<(event: MemoryEvent) => void>();
  /** Memory spoke — as if a file had been saved. */
  remember(event: MemoryEvent): void {
    for (const one of this.listeners) one(event);
  }
  readonly memory: ProjectMemory = {
    on: (handler) => {
      this.listeners.add(handler);
      return () => this.listeners.delete(handler);
    },
    files: () => [],
    docSync: () => null,
    peekDoc: async (path) => ({ path, text: '', version: 0, openCount: 0 }),
    isTextual: () => false,
    disk: async () => null,
    settle: async () => undefined,
    adopt: async () => undefined,
  };
  async dispose(): Promise<void> {
    for (const one of this.resources.values()) await one.dispose();
  }
}

/** The launching is real but without the core: exactly what the contract promises. */
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

function fakeIde(projects: Array<(project: Project) => void>): Ide {
  return {
    name: '@mosetta/ide-plugin-git',
    method: () => undefined,
    getPlugin: () => {
      throw new Error('there are no neighbours in this test');
    },
    onProject: (handler) => {
      projects.push(handler);
    },
    settings: <T>(_section: string, defaults: T) => defaults,
    environment: () => ({}),
    which: () => null,
    killTree: async () => 0,
    dir: '',
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
    await git('config', 'user.name', 'A test');
    await git('add', '.');
    await git('commit', '-m', 'the first');

    project = new FakeProject(root);
    const projects: Array<(project: Project) => void> = [];
    const server = new GitServer(fakeIde(projects));
    await hooksOf(server).start?.();
    for (const handler of projects) handler(project);
    const methods = new Map<string, CommandHandler>(declaredOf(server));
    const ctx: CallContext = { project, services: null };
    call = (method, params = null) => {
      const handler = methods.get(method);
      if (!handler) throw new Error(`no such method: ${method}`);
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

  it('a clean repository: there is a branch and no changes', async () => {
    const fresh = (await call('refresh')) as GitState;
    expect(fresh.repo).toBe(true);
    expect(fresh.branch).toBe('main');
    expect(fresh.files).toEqual({});
  });

  it('an edit to a file shows as a change, a new file as unversioned', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    await fs.writeFile(path.join(root, 'src/new.ts'), 'export const three = 3;\n');
    const got = (await call('refresh')) as GitState;
    expect(got.files['src/main.ts']).toBe('modified');
    expect(got.files['src/new.ts']).toBe('untracked');
    expect(got.files['src/util.ts']).toBeUndefined();
  });

  it('it hands the file over as it was in the commit', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 999;\n');
    const head = (await call('head', { path: 'src/main.ts' })) as { path: string; text: string | null };
    expect(head.path).toBe('src/main.ts');
    expect(head.text).toBe('export const one = 1;\n');
  });

  it('the file is not in the history — that is an answer rather than an error', async () => {
    await fs.writeFile(path.join(root, 'src/fresh.ts'), 'export const three = 3;\n');
    const head = (await call('head', { path: 'src/fresh.ts' })) as { text: string | null };
    expect(head.text).toBeNull();
  });

  it('the index hears memory: a file was saved and the painting updated with no poll', async () => {
    await state();
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 11;\n');
    project.remember({ type: 'doc.saved', path: 'src/main.ts' });
    const started = Date.now();
    for (;;) {
      const now = await state();
      if (now.files['src/main.ts']) break;
      if (Date.now() - started > 2000) throw new Error('the index did not hear memory');
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('the state is handed over from memory rather than computed on request', async () => {
    await call('refresh');
    const started = Date.now();
    for (let i = 0; i < 20; i += 1) await state();
    expect(Date.now() - started).toBeLessThan(300);
  });

  it('branches: the current one is marked, a new one appears and is switched to', async () => {
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

  it('an action prints its output rather than staying silent to the end', async () => {
    await call('refresh');
    await act({ action: 'create', name: 'streamed' });
    const chunks = project.heard
      .filter((one) => one.event === 'output')
      .map((one) => one.payload as { action: string; chunk: string });
    const text = chunks.map((one) => one.chunk).join('');
    expect(text).toContain('$ git checkout -b streamed');
    expect(text).toContain('[done]');
    expect(chunks.every((one) => one.action === 'create')).toBe(true);
  }, 15_000);

  it('git\'s refusal arrives in its own words rather than our retelling', async () => {
    await call('refresh');
    const { error } = await act({ action: 'checkout', branch: 'no-such' });
    expect(error).toMatch(/did not match|pathspec|not found/i);
  });

  it('a branch name cannot become a git flag', async () => {
    await expect(act({ action: 'checkout', branch: '--exec=rm -rf /' })).rejects.toThrow(
      /an inadmissible branch name/,
    );
    await expect(act({ action: 'create', name: 'two branches' })).rejects.toThrow(
      /an inadmissible branch name/,
    );
  });

  it('the push window knows what will travel and what will be overwritten', async () => {
    await call('refresh');
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-bare-'));
    await run('git', ['init', '--bare', '-b', 'main', bare]);
    await git('remote', 'add', 'origin', bare);
    await git('push', '-u', 'origin', 'main');

    await fs.writeFile(path.join(root, 'src/mine.ts'), 'export const mine = 1;\n');
    await git('add', '.');
    await git('commit', '-m', 'mine');

    let preview = await outgoing();
    expect(preview.branch).toBe('main');
    expect(preview.upstream).toBe('origin/main');
    expect(preview.local.map((c) => c.subject)).toEqual(['mine']);
    expect(preview.remote).toEqual([]);
    expect(preview.common.map((c) => c.subject)).toEqual(['the first']);

    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-other-'));
    await run('git', ['clone', bare, other]);
    await run('git', ['-C', other, 'config', 'user.email', 'other@example.com']);
    await run('git', ['-C', other, 'config', 'user.name', 'Another']);
    await fs.writeFile(path.join(other, 'theirs.ts'), 'export const theirs = 1;\n');
    await run('git', ['-C', other, 'add', '.']);
    await run('git', ['-C', other, 'commit', '-m', 'theirs']);
    await run('git', ['-C', other, 'push']);

    await act({ action: 'fetch' });
    preview = await outgoing();
    expect(preview.local.map((c) => c.subject)).toEqual(['mine']);
    expect(preview.remote.map((c) => c.subject)).toEqual(['theirs']);

    await fs.rm(bare, { recursive: true, force: true });
    await fs.rm(other, { recursive: true, force: true });
  }, 30_000);

  it('a push\'s files: the whole outgoing diff, and one commit\'s diff', async () => {
    await call('refresh');
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-bare2-'));
    await run('git', ['init', '--bare', '-b', 'main', bare]);
    await git('remote', 'add', 'origin', bare);
    await git('push', '-u', 'origin', 'main');

    await fs.writeFile(path.join(root, 'src/one.ts'), 'export const one = 1;\n');
    await git('add', '.');
    await git('commit', '-m', 'my first');
    await fs.writeFile(path.join(root, 'src/two.ts'), 'export const two = 2;\n');
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    await git('add', '.');
    await git('commit', '-m', 'my second');

    const all = await changes();
    expect(all.map((c) => c.path).sort()).toEqual(['src/main.ts', 'src/one.ts', 'src/two.ts']);
    expect(all.find((c) => c.path === 'src/main.ts')?.state).toBe('modified');
    expect(all.find((c) => c.path === 'src/one.ts')?.state).toBe('added');

    const preview = await outgoing();
    const older = preview.local[preview.local.length - 1]!;
    expect(older.subject).toBe('my first');
    const one = await changes({ commit: older.short });
    expect(one.map((c) => c.path)).toEqual(['src/one.ts']);

    await fs.rm(bare, { recursive: true, force: true });
  }, 30_000);

  it('a rename in the status parsing does not eat the next record', () => {
    const raw = 'R  new.ts\0old.ts\0 M src/main.ts\0?? src/fresh.ts\0';
    expect(new GitStatus().parse(raw).files).toEqual({
      'new.ts': 'modified',
      'src/main.ts': 'modified',
      'src/fresh.ts': 'untracked',
    });
  });

  it('a move is REMEMBERED: without the old name a diff would show the file written afresh', () => {
    const raw = 'R  plugins/ui/src/ask-popup.tsx\0plugins/tree/src/prompt.tsx\0';
    expect(new GitStatus().parse(raw).moved).toEqual({
      'plugins/ui/src/ask-popup.tsx': 'plugins/tree/src/prompt.tsx',
    });
  });
});
