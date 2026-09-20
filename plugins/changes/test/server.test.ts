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

class FakeProject implements Project {
  private readonly resources = new Map<string, ProjectResource>();
  readonly settled: Array<{ path: string; text: string | null }> = [];
  constructor(readonly root: string) {}
  readonly name = 'проект';
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
    throw new Error('долгоживущих процессов в этом тесте нет');
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

describe('изменения: коммит и полка', () => {
  let root: string;
  let state: string;
  let project: FakeProject;
  let call: (method: string, params?: unknown) => Promise<unknown>;
  let events: MemoryEvent[];
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
    await git('config', 'user.name', 'Тест');
    await git('add', '.');
    await git('commit', '-m', 'первый');

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
      if (!handler) throw new Error(`нет метода ${method}`);
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

  it('конфликтная полка заводит СПОР, а не отказ (ADR-0246)', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    const put = await shelve({ name: 'моя правка', files: ['src/main.ts'] });
    expect(put.error).toBe(null);

    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 222;\n');
    await git('commit', '-am', 'чужая правка');

    const back = await unshelve({ id: put.item!.id });
    expect(back.error, 'это не отказ: патч лёг, спорят строки').toBe(null);
    expect(supplied).toHaveLength(1);

    const supply = supplied[0]!;
    expect(supply.source).toBe('shelve');
    expect(supply.files.map((one) => one.path)).toEqual(['src/main.ts']);
    expect(supply.files[0]!.base).toContain('one = 1;');
    expect(supply.files[0]!.left.text).toContain('one = 222;');
    expect(supply.files[0]!.right.text).toContain('one = 111;');
    expect(await shelves(), 'полку спор не трогает — как и удачное наложение').toHaveLength(1);
  });

  it('разобранный спор дописывает итог и снимает ступени, а полку не трогает', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    const put = await shelve({ name: 'моя правка', files: ['src/main.ts'] });
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 222;\n');
    await git('commit', '-am', 'чужая правка');
    await unshelve({ id: put.item!.id });

    const supply = supplied[0]!;
    await supply.apply('src/main.ts', 'export const one = 333;\n');
    await supply.finish?.();

    expect(project.settled).toEqual([{ path: 'src/main.ts', text: 'export const one = 333;\n' }]);
    expect(await shelves(), 'разобранный спор — то же снятие: полка цела').toHaveLength(1);
    expect(await git('status', '--porcelain')).not.toContain('U');
  });

  it('отказ от спора возвращает дерево в то, чем оно было, и не трогает полку', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    const put = await shelve({ name: 'моя правка', files: ['src/main.ts'] });
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 222;\n');
    await git('commit', '-am', 'чужая правка');
    await unshelve({ id: put.item!.id });

    await supplied[0]!.cancel?.();
    expect(project.settled.at(-1)?.text, 'вернулась НАША сторона, а не предок').toContain('one = 222;');
    expect(await git('status', '--porcelain')).not.toContain('U');
    expect(await shelves(), 'работа цела: запись осталась').toHaveLength(1);
  });

  it('коммитит ТОЛЬКО отмеченные файлы, не трогая индекс', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 11;\n');
    await fs.writeFile(path.join(root, 'src/util.ts'), 'export const two = 22;\n');

    expect(await commit({ message: 'только main', files: ['src/main.ts'] })).toEqual({ error: null });

    expect(await git('log', '-1', '--pretty=%s')).toContain('только main');
    expect(await git('status', '--porcelain')).toContain('src/util.ts');
    expect(await git('show', '--stat', '--pretty=', 'HEAD')).not.toContain('util.ts');
  });

  it('новый файл добавляется сам: git его без `add` не видит вовсе', async () => {
    await fs.writeFile(path.join(root, 'src/fresh.ts'), 'export const three = 3;\n');
    expect(await commit({ message: 'новый', files: ['src/fresh.ts'] })).toEqual({ error: null });
    expect(await git('show', '--stat', '--pretty=', 'HEAD')).toContain('fresh.ts');
  });

  it('без сообщения и без файлов не коммитит, и говорит почему', async () => {
    expect((await commit({ message: '  ', files: ['src/main.ts'] })).error).toBe('commit message is required');
    expect((await commit({ message: 'есть', files: [] })).error).toBe('no files selected');
  });

  it('полка: патч уходит из дерева и возвращается на место', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 99;\n');

    const put = await shelve({ name: 'девяносто девять', files: ['src/main.ts'] });
    expect(put.error).toBeNull();
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('export const one = 1;\n');
    expect(await git('status', '--porcelain')).toBe('');

    const list = await shelves();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('девяносто девять');
    expect(list[0]?.files).toEqual(['src/main.ts']);

    expect(await unshelve({ id: list[0]!.id })).toEqual({ error: null });
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('export const one = 99;\n');
    expect(await git('status', '--porcelain')).toBe(' M src/main.ts\n');
    expect(await shelves()).toHaveLength(1);
  });

  it('приложить можно сколько угодно раз: ни дерево, ни полка не портятся', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 99;\n');
    const put = await shelve({ name: 'девяносто девять', files: ['src/main.ts'] });

    for (const attempt of [1, 2, 3]) {
      expect(await unshelve({ id: put.item!.id }), `заход ${attempt}`).toEqual({ error: null });
      expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('export const one = 99;\n');
      expect(await git('status', '--porcelain')).toBe(' M src/main.ts\n');
      expect(await shelves()).toHaveLength(1);
    }
  });

  it('ложится на файл, который человек уже правил', async () => {
    const main = path.join(root, 'src/main.ts');
    await fs.writeFile(main, 'one\ntwo\nthree\nfour\nfive\n');
    await git('commit', '-am', 'многострочный');

    await fs.writeFile(main, 'one\ntwo\nTHREE\nfour\nfive\n');
    const put = await shelve({ name: 'середина', files: ['src/main.ts'] });

    await fs.writeFile(main, 'ONE\ntwo\nthree\nfour\nfive\n');

    expect(await unshelve({ id: put.item!.id })).toEqual({ error: null });
    expect(await fs.readFile(main, 'utf8'), 'обе правки на месте').toBe('ONE\ntwo\nTHREE\nfour\nfive\n');
    expect(await git('status', '--porcelain')).toBe(' M src/main.ts\n');
  });

  it('чужая отметка в индексе переживает наложение', async () => {
    await fs.writeFile(path.join(root, 'src/util.ts'), 'export const two = 22;\n');
    await git('add', '--', 'src/util.ts');

    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 99;\n');
    const put = await shelve({ name: 'девяносто девять', files: ['src/main.ts'] });
    expect(await unshelve({ id: put.item!.id })).toEqual({ error: null });

    const status = await git('status', '--porcelain');
    expect(status, 'отметка человека цела').toContain('M  src/util.ts');
    expect(status, 'наше — в дереве, а не в индексе').toContain(' M src/main.ts');
  });

  it('файл ушёл ВПЕРЁД в историю — правка ложится на новую версию', async () => {
    const main = path.join(root, 'src/main.ts');
    await fs.writeFile(main, 'a\nb\nc\nd\ne\n');
    await git('commit', '-am', 'пять строк');

    await fs.writeFile(main, 'a\nb\nПОЛКА\nd\ne\n');
    const put = await shelve({ name: 'середина', files: ['src/main.ts'] });

    await fs.writeFile(main, 'НАЧАЛО\nb\nc\nd\ne\n');
    await git('commit', '-am', 'ушли вперёд');

    expect(await unshelve({ id: put.item!.id })).toEqual({ error: null });
    expect(await fs.readFile(main, 'utf8')).toBe('НАЧАЛО\nb\nПОЛКА\nd\ne\n');
  });

  it('файла в дереве нет — возвращаем его с полки', async () => {
    const main = path.join(root, 'src/main.ts');
    await fs.writeFile(main, 'export const one = 99;\n');
    const put = await shelve({ name: 'девяносто девять', files: ['src/main.ts'] });

    await fs.rm(main);
    const back = await unshelve({ id: put.item!.id });
    expect(back.error).toBe(null);
    expect(await fs.readFile(main, 'utf8')).toBe('export const one = 99;\n');
  });

  it('файла нет и в истории — всё равно возвращаем, и говорим об этом', async () => {
    const main = path.join(root, 'src/main.ts');
    await fs.writeFile(main, 'export const one = 99;\n');
    const put = await shelve({ name: 'девяносто девять', files: ['src/main.ts'] });

    await git('rm', '-q', '--', 'src/main.ts');
    await git('commit', '-m', 'убрали совсем');

    const back = await unshelve({ id: put.item!.id });
    expect(back.error).toBe(null);
    expect(back.restored, 'воскрешение — не тихое дело').toEqual(['src/main.ts']);
    expect(await fs.readFile(main, 'utf8')).toBe('export const one = 99;\n');
    expect(await git('status', '--porcelain')).toBe('?? src/main.ts\n');
  });

  it('на неразобранный спор не накладываем, и говорим почему', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 111;\n');
    const put = await shelve({ name: 'моя правка', files: ['src/main.ts'] });
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 222;\n');
    await git('commit', '-am', 'чужая правка');
    await unshelve({ id: put.item!.id });

    const again = await unshelve({ id: put.item!.id });
    expect(again.error).toContain('sort out the conflict first');
    expect(supplied, 'второго сеанса не завели').toHaveLength(1);
  });

  it('снятие ЧАСТИ файлов оставляет патч целым', async () => {
    await fs.writeFile(path.join(root, 'src/main.ts'), 'export const one = 99;\n');
    await fs.writeFile(path.join(root, 'src/util.ts'), 'export const two = 88;\n');
    const put = await shelve({ name: 'оба', files: ['src/main.ts', 'src/util.ts'] });

    expect(await unshelve({ id: put.item!.id, files: ['src/main.ts'] })).toEqual({ error: null });
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('export const one = 99;\n');
    expect(await fs.readFile(path.join(root, 'src/util.ts'), 'utf8')).toBe('export const two = 2;\n');
    expect((await shelves())[0]?.files).toEqual(['src/main.ts', 'src/util.ts']);

    expect(await unshelve({ id: put.item!.id, files: ['src/util.ts'] })).toEqual({ error: null });
    expect(await fs.readFile(path.join(root, 'src/util.ts'), 'utf8')).toBe('export const two = 88;\n');
    expect((await shelves())[0]?.files).toEqual(['src/main.ts', 'src/util.ts']);
  });

  it('полка помнит и НЕОТСЛЕЖИВАЕМЫЙ файл — с содержимым', async () => {
    await fs.writeFile(path.join(root, 'src/fresh.ts'), 'export const three = 3;\n');

    const put = await shelve({ name: 'новый файл', files: ['src/fresh.ts'] });
    expect(put.error).toBeNull();
    await expect(fs.stat(path.join(root, 'src/fresh.ts'))).rejects.toThrow();
    expect(await git('status', '--porcelain')).toBe('');

    const list = await shelves();
    expect(await unshelve({ id: list[0]!.id })).toEqual({ error: null });
    expect(await fs.readFile(path.join(root, 'src/fresh.ts'), 'utf8')).toBe('export const three = 3;\n');
  });

  it('откладывать нечего — говорим об этом, а не заводим пустую запись', async () => {
    const put = await shelve({ name: 'пусто', files: ['src/main.ts'] });
    expect(put.error).toBe('nothing to shelve: no changes in these files');
    expect(await shelves()).toEqual([]);
  });

  it('имя записи проверяется: `..` не выведет за папку полки', async () => {
    await expect(call('drop', { id: '../../побег' })).rejects.toThrow(/bad shelf id/);
  });
});
