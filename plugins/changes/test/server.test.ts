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
  type MemoryEvent,
  type Project,
  type ProjectMemory,
  type ProjectResource,
  type RunAsk,
  type RunResult,
} from '@mosetta/ide-api/server';
import GitServer from '@mosetta/ide-plugin-git/server';
import MergeServer from '@mosetta/ide-plugin-merge/server';
import type { MergeSupply } from '@mosetta/ide-plugin-merge';
import ChangesServer from '../src/server.js';
import type { ShelfItem } from '../src/shelf.js';

const run = promisify(execFile);

/**
 * The commit and the shelf against REAL git.
 *
 * A fake would be checking our belief in its habits rather than the habits themselves:
 * that `git commit -- <paths>` takes the working tree past the index, and that an
 * untracked file's patch is only taken after `add -N`, are git's promises, and they are
 * worth exactly what checking them is worth.
 */

class FakeProject implements Project {
  private readonly resources = new Map<string, ProjectResource>();
  /** Where the argument's result went: the memory layer is faked while the disk is real. */
  readonly settled: Array<{ path: string; text: string | null }> = [];
  constructor(readonly root: string) {}
  readonly name = 'project';
  use<T extends ProjectResource>(key: string, create: () => T): T {
    const have = this.resources.get(key);
    if (have) return have as T;
    const made = create();
    this.resources.set(key, made);
    return made;
  }
  emit(): void {}
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
  start(): never {
    throw new Error('there are no long-lived processes in this test');
  }
  readonly memory: ProjectMemory = {
    on: () => () => undefined,
    files: () => [],
    docSync: () => null,
    peekDoc: async (path) => ({ path, text: '', version: 0, openCount: 0 }),
    isTextual: () => false,
    disk: async () => null,
    settle: async (file: string, text: string | null) => {
      this.settled.push({ path: file, text });
      if (text === null) await fs.rm(path.join(this.root, file), { force: true });
      else await fs.writeFile(path.join(this.root, file), text, 'utf8');
    },
    adopt: async () => undefined,
  };
  async dispose(): Promise<void> {
    for (const one of this.resources.values()) await one.dispose();
  }
}

function running(spec: RunAsk): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: { ...process.env, LC_ALL: 'C', ...spec.env } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('close', (code) =>
      resolve({ ok: code === 0, stdout: out, stderr: err.trim(), code, timedOut: false, truncated: false }),
    );
    child.on('error', (e) =>
      resolve({ ok: false, stdout: out, stderr: e.message, code: null, timedOut: false, truncated: false }),
    );
  });
}

const silent = { debug() {}, info() {}, warn() {}, error() {} };

describe('changes: the commit and the shelf', () => {
  let root: string;
  let state: string;
  let project: FakeProject;
  let call: (method: string, params?: unknown) => Promise<unknown>;
  let events: MemoryEvent[];
  /**
   * What was brought to the merge screen: there is one supplier, and it is what we
   * check.
   */
  let supplied: MergeSupply[];
  let mergeStub: { open: (root: string, supply: MergeSupply) => void };

  async function git(...args: string[]): Promise<string> {
    const done = await run('git', args, { cwd: root });
    return done.stdout;
  }

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ide-changes-')));
    state = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-changes-state-'));
    events = [];
    supplied = [];
    mergeStub = { open: (_root, supply) => supplied.push(supply) };
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 1;\n');
    await fs.writeFile(path.join(root, 'src/util.ts'), 'export const two = 2;\n');
    await git('init', '-b', 'main');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'user.name', 'Test');
    await git('add', '.');
    await git('commit', '-m', 'the first');

    project = new FakeProject(root);
    const ide: Ide = {
      name: '@mosetta/ide-plugin-changes',
      method: () => undefined,
      getPlugin: ((plugin: unknown) =>
        plugin === MergeServer ? mergeStub : new GitServer(ide)) as Ide['getPlugin'],
      onProject: () => undefined,
      settings: <T>(_section: string, defaults: T) => defaults,
      environment: () => ({}),
      which: () => null,
      killTree: async () => 0,
      dir: '',
      state,
      run: (ask) => running(ask),
      stream: (ask) => running(ask),
      log: silent,
    };
    const server = new ChangesServer(ide);
    const methods = new Map<string, CommandHandler>(declaredOf(server));
    const ctx: CallContext = { project, services: null };
    call = (method, params = null) => {
      const handler = methods.get(method);
      if (!handler) throw new Error(`there is no method ${method}`);
      return Promise.resolve(handler(params, ctx));
    };
  });

  afterEach(async () => {
    await project.dispose();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    await fs.rm(state, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    expect(events).toEqual([]);
  });

  const commit = (p: object) => call('commit', p) as Promise<{ error: string | null }>;
  const shelve = (p: object) => call('shelve', p) as Promise<{ error: string | null; item?: ShelfItem }>;
  const shelves = () => call('shelves') as Promise<ShelfItem[]>;
  const unshelve = (p: object) =>
    call('unshelve', p) as Promise<{ error: string | null; restored?: string[] }>;

  it('a conflicting shelf sets up an ARGUMENT rather than a refusal', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    const put = await shelve({ name: 'my edit', files: ['src/main.ts'] });
    expect(put.error).toBe(null);

    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 222;\n');
    await git('commit', '-am', 'somebody else\'s edit');

    const back = await unshelve({ id: put.item!.id });
    expect(back.error, 'this is no refusal: the patch went on, it is the rows that argue').toBe(null);
    expect(supplied).toHaveLength(1);

    const supply = supplied[0]!;
    expect(supply.source).toBe('shelve');
    expect(supply.files.map((one) => one.path)).toEqual(['src/main.ts']);
    expect(supply.files[0]!.base).toContain('one = 1;');
    expect(supply.files[0]!.left.text).toContain('one = 222;');
    expect(supply.files[0]!.right.text).toContain('one = 111;');
    expect(await shelves(), 'an argument does not touch the shelf — nor does a successful application').toHaveLength(1);
  });

  it('a sorted-out argument writes the result down and takes off the stages, and leaves the shelf alone', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    const put = await shelve({ name: 'my edit', files: ['src/main.ts'] });
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 222;\n');
    await git('commit', '-am', 'somebody else\'s edit');
    await unshelve({ id: put.item!.id });

    const supply = supplied[0]!;
    await supply.apply('src/main.ts', 'export const one = 333;\n');
    await supply.finish?.();

    expect(project.settled).toEqual([{ path: 'src/main.ts', text: 'export const one = 333;\n' }]);
    expect(await shelves(), 'a sorted-out argument is the same application: the shelf is intact').toHaveLength(1);
    expect(await git('status', '--porcelain')).not.toContain('U');
  });

  it('giving up on an argument puts the tree back into what it was, and leaves the shelf alone', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    const put = await shelve({ name: 'my edit', files: ['src/main.ts'] });
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 222;\n');
    await git('commit', '-am', 'somebody else\'s edit');
    await unshelve({ id: put.item!.id });

    await supplied[0]!.cancel?.();
    expect(project.settled.at(-1)?.text, 'OUR side came back rather than the ancestor').toContain('one = 222;');
    expect(await git('status', '--porcelain')).not.toContain('U');
    expect(await shelves(), 'the work is intact: the entry has stayed').toHaveLength(1);
  });

  it('it commits ONLY the ticked files, without touching the index', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 11;\n');
    await fs.writeFile(path.join(root, 'src/util.ts'), 'export const two = 22;\n');

    expect(await commit({ message: 'main only', files: ['src/main.ts'] })).toEqual({ error: null });

    expect(await git('log', '-1', '--pretty=%s')).toContain('main only');
    expect(await git('status', '--porcelain')).toContain('src/util.ts');
    expect(await git('show', '--stat', '--pretty=', 'HEAD')).not.toContain('util.ts');
  });

  it('a new file adds itself: git does not see it at all without `add`', async () => {
    await fs.writeFile(path.join(root, 'src/fresh.ts'), 'export const three = 3;\n');
    expect(await commit({ message: 'new', files: ['src/fresh.ts'] })).toEqual({ error: null });
    expect(await git('show', '--stat', '--pretty=', 'HEAD')).toContain('fresh.ts');
  });

  it('with no message and no files it does not commit, and says why', async () => {
    expect((await commit({ message: '  ', files: ['src/main.ts'] })).error).toBe('commit message is required');
    expect((await commit({ message: 'present', files: [] })).error).toBe('no files selected');
  });

  it('the shelf: the patch leaves the tree and comes back into place', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 99;\n');

    const put = await shelve({ name: 'ninety-nine', files: ['src/main.ts'] });
    expect(put.error).toBeNull();
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('export const one = 1;\n');
    expect(await git('status', '--porcelain')).toBe('');

    const list = await shelves();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('ninety-nine');
    expect(list[0]?.files).toEqual(['src/main.ts']);

    expect(await unshelve({ id: list[0]!.id })).toEqual({ error: null });
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('export const one = 99;\n');
    expect(await git('status', '--porcelain')).toBe(' M src/main.ts\n');
    expect(await shelves()).toHaveLength(1);
  });

  it('it can be applied as many times as you like: neither the tree nor the shelf is spoilt', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 99;\n');
    const put = await shelve({ name: 'ninety-nine', files: ['src/main.ts'] });

    for (const attempt of [1, 2, 3]) {
      expect(await unshelve({ id: put.item!.id }), `attempt ${attempt}`).toEqual({ error: null });
      expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('export const one = 99;\n');
      expect(await git('status', '--porcelain')).toBe(' M src/main.ts\n');
      expect(await shelves()).toHaveLength(1);
    }
  });

  it('it lays onto a file the user has already edited', async () => {
    const main = path.join(root, 'src/main.ts');
    await fs.writeFile(main, 'one\ntwo\nthree\nfour\nfive\n');
    await git('commit', '-am', 'multi-line');

    await fs.writeFile(main, 'one\ntwo\nTHREE\nfour\nfive\n');
    const put = await shelve({ name: 'the middle', files: ['src/main.ts'] });

    await fs.writeFile(main, 'ONE\ntwo\nthree\nfour\nfive\n');

    expect(await unshelve({ id: put.item!.id })).toEqual({ error: null });
    expect(await fs.readFile(main, 'utf8'), 'both edits are in place').toBe('ONE\ntwo\nTHREE\nfour\nfive\n');
    expect(await git('status', '--porcelain')).toBe(' M src/main.ts\n');
  });

  it('somebody else\'s mark in the index survives the application', async () => {
    await fs.writeFile(path.join(root, 'src/util.ts'), 'export const two = 22;\n');
    await git('add', '--', 'src/util.ts');

    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 99;\n');
    const put = await shelve({ name: 'ninety-nine', files: ['src/main.ts'] });
    expect(await unshelve({ id: put.item!.id })).toEqual({ error: null });

    const status = await git('status', '--porcelain');
    expect(status, 'the user\'s mark is intact').toContain('M  src/util.ts');
    expect(status, 'ours is in the tree rather than in the index').toContain(' M src/main.ts');
  });

  it('the file has moved ON in the history — the edit lays onto the new version', async () => {
    const main = path.join(root, 'src/main.ts');
    await fs.writeFile(main, 'a\nb\nc\nd\ne\n');
    await git('commit', '-am', 'five lines');

    await fs.writeFile(main, 'a\nb\nSHELF\nd\ne\n');
    const put = await shelve({ name: 'the middle', files: ['src/main.ts'] });

    await fs.writeFile(main, 'START\nb\nc\nd\ne\n');
    await git('commit', '-am', 'moved on');

    expect(await unshelve({ id: put.item!.id })).toEqual({ error: null });
    expect(await fs.readFile(main, 'utf8')).toBe('START\nb\nSHELF\nd\ne\n');
  });

  it('the file is not in the tree — we bring it back off the shelf', async () => {
    const main = path.join(root, 'src/main.ts');
    await fs.writeFile(main, 'export const one = 99;\n');
    const put = await shelve({ name: 'ninety-nine', files: ['src/main.ts'] });

    await fs.rm(main);
    const back = await unshelve({ id: put.item!.id });
    expect(back.error).toBe(null);
    expect(await fs.readFile(main, 'utf8')).toBe('export const one = 99;\n');
  });

  it('the file is not in the history either — we still bring it back, and say so', async () => {
    const main = path.join(root, 'src/main.ts');
    await fs.writeFile(main, 'export const one = 99;\n');
    const put = await shelve({ name: 'ninety-nine', files: ['src/main.ts'] });

    await git('rm', '-q', '--', 'src/main.ts');
    await git('commit', '-m', 'removed altogether');

    const back = await unshelve({ id: put.item!.id });
    expect(back.error).toBe(null);
    expect(back.restored, 'a resurrection is no quiet business').toEqual(['src/main.ts']);
    expect(await fs.readFile(main, 'utf8')).toBe('export const one = 99;\n');
    expect(await git('status', '--porcelain')).toBe('?? src/main.ts\n');
  });

  it('we do not lay onto an argument that has not been sorted out, and we say why', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    const put = await shelve({ name: 'my edit', files: ['src/main.ts'] });
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 222;\n');
    await git('commit', '-am', 'somebody else\'s edit');
    await unshelve({ id: put.item!.id });

    const again = await unshelve({ id: put.item!.id });
    expect(again.error).toContain('sort out the conflict first');
    expect(supplied, 'no second session was set up').toHaveLength(1);
  });

  it('applying SOME of the files leaves the patch whole', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 99;\n');
    await fs.writeFile(path.join(root, 'src/util.ts'), 'export const two = 88;\n');
    const put = await shelve({ name: 'both', files: ['src/main.ts', 'src/util.ts'] });

    expect(await unshelve({ id: put.item!.id, files: ['src/main.ts'] })).toEqual({ error: null });
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('export const one = 99;\n');
    expect(await fs.readFile(path.join(root, 'src/util.ts'), 'utf8')).toBe('export const two = 2;\n');
    expect((await shelves())[0]?.files).toEqual(['src/main.ts', 'src/util.ts']);

    expect(await unshelve({ id: put.item!.id, files: ['src/util.ts'] })).toEqual({ error: null });
    expect(await fs.readFile(path.join(root, 'src/util.ts'), 'utf8')).toBe('export const two = 88;\n');
    expect((await shelves())[0]?.files).toEqual(['src/main.ts', 'src/util.ts']);
  });

  it('the shelf remembers an UNTRACKED file too — with its contents', async () => {
    await fs.writeFile(path.join(root, 'src/fresh.ts'), 'export const three = 3;\n');

    const put = await shelve({ name: 'new file', files: ['src/fresh.ts'] });
    expect(put.error).toBeNull();
    await expect(fs.stat(path.join(root, 'src/fresh.ts'))).rejects.toThrow();
    expect(await git('status', '--porcelain')).toBe('');

    const list = await shelves();
    expect(await unshelve({ id: list[0]!.id })).toEqual({ error: null });
    expect(await fs.readFile(path.join(root, 'src/fresh.ts'), 'utf8')).toBe('export const three = 3;\n');
  });

  it('there is nothing to put aside — we say so rather than set up an empty entry', async () => {
    const put = await shelve({ name: 'empty', files: ['src/main.ts'] });
    expect(put.error).toBe('nothing to shelve: no changes in these files');
    expect(await shelves()).toEqual([]);
  });

  it('an entry\'s name is checked: a `..` does not lead out of the shelf\'s directory', async () => {
    await expect(call('drop', { id: '../../escape' })).rejects.toThrow(/bad shelf id/);
  });
});
