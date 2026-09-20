import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Changelists } from '../src/lists.js';
import { DEFAULT_LIST, UNRESOLVED_LIST } from '../src/changelist.js';

let state: string;
let lists: Changelists;
const ROOT = '/tmp/some/project';

beforeEach(async () => {
  state = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-lists-'));
  lists = new Changelists(() => state);
});

afterEach(async () => {
  await fs.rm(state, { recursive: true, force: true });
});

describe('ченжлисты', () => {
  it('без файла есть два зарезервированных, и они первые', async () => {
    expect((await lists.read(ROOT)).map((one) => one.id)).toEqual([DEFAULT_LIST, UNRESOLVED_LIST]);
  });

  it('заведённый список переживает перечитывание', async () => {
    const made = await lists.create(ROOT, 'моя ветка');
    const again = new Changelists(() => state);
    expect((await again.read(ROOT)).map((one) => one.name)).toEqual([DEFAULT_LIST, UNRESOLVED_LIST, 'моя ветка']);
    expect(made.id, 'id читаемый, но не имя: переименование его не трогает').toBe('моя-ветка');
  });

  it('файл лежит ровно в одном списке', async () => {
    const first = await lists.create(ROOT, 'первый');
    const second = await lists.create(ROOT, 'второй');
    await lists.move(ROOT, first.id, ['src/a.ts']);
    await lists.move(ROOT, second.id, ['src/a.ts']);

    const now = await lists.read(ROOT);
    expect(now.find((one) => one.id === first.id)!.files).toEqual([]);
    expect(now.find((one) => one.id === second.id)!.files).toEqual(['src/a.ts']);
  });

  it('`changes` путей не хранит: он «всё остальное»', async () => {
    const mine = await lists.create(ROOT, 'моё');
    await lists.move(ROOT, mine.id, ['src/a.ts']);
    await lists.move(ROOT, DEFAULT_LIST, ['src/a.ts']);

    const now = await lists.read(ROOT);
    expect(now.find((one) => one.id === DEFAULT_LIST)!.files).toEqual([]);
    expect(now.find((one) => one.id === mine.id)!.files, 'из прежнего ушёл').toEqual([]);
  });

  it('переезд ОДНОГО файла не уносит из списка остальные', async () => {
    const mine = await lists.create(ROOT, 'моё');
    await lists.move(ROOT, mine.id, ['a.ts', 'b.ts']);
    await lists.move(ROOT, DEFAULT_LIST, ['a.ts']);

    const now = await lists.read(ROOT);
    expect(now.find((one) => one.id === mine.id)!.files).toEqual(['b.ts']);
  });

  it('зарезервированные нельзя ни убрать, ни переименовать', async () => {
    await expect(lists.remove(ROOT, DEFAULT_LIST)).rejects.toThrow();
    await expect(lists.remove(ROOT, UNRESOLVED_LIST)).rejects.toThrow();
    await expect(lists.rename(ROOT, DEFAULT_LIST, 'иначе')).rejects.toThrow();
  });

  it('убранный список не уносит файлы: они возвращаются в «всё остальное»', async () => {
    const mine = await lists.create(ROOT, 'моё');
    await lists.move(ROOT, mine.id, ['src/a.ts']);
    await lists.remove(ROOT, mine.id);
    expect((await lists.read(ROOT)).map((one) => one.id)).toEqual([DEFAULT_LIST, UNRESOLVED_LIST]);
  });

  it('два списка с одним именем — законное состояние, id у них разные', async () => {
    const first = await lists.create(ROOT, 'моё');
    const second = await lists.create(ROOT, 'моё');
    expect(first.id).not.toBe(second.id);
  });

  it('битый файл не роняет панель: списки читаются пустыми', async () => {
    const file = lists.fileFor(ROOT);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '{ это не json', 'utf8');
    expect((await lists.read(ROOT)).map((one) => one.id)).toEqual([DEFAULT_LIST, UNRESOLVED_LIST]);
  });

  it('у двух проектов с одинаковым именем папки списки разные', async () => {
    expect(lists.fileFor('/one/web-ide')).not.toBe(lists.fileFor('/two/web-ide'));
  });
});
