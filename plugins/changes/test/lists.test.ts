import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Changelists } from '../src/lists.js';
import { DEFAULT_LIST, UNRESOLVED_LIST } from '../src/changelist.js';

/**
 * Changelists are a workspace setting: a file in the plugin's state directory, keyed by
 * the project's path. We check the store's promises: the two reserved names are always
 * there, a file lies in exactly one list, and `changes` holds no paths at all.
 */

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

describe('changelists', () => {
  it('with no file there are the two reserved ones, and they come first', async () => {
    expect((await lists.read(ROOT)).map((one) => one.id)).toEqual([DEFAULT_LIST, UNRESOLVED_LIST]);
  });

  it('a list that has been set up survives a re-reading', async () => {
    const made = await lists.create(ROOT, 'моя ветка');
    const again = new Changelists(() => state);
    expect((await again.read(ROOT)).map((one) => one.name)).toEqual([DEFAULT_LIST, UNRESOLVED_LIST, 'моя ветка']);
    expect(made.id, 'the id is readable but is not the name: renaming does not touch it').toBe('моя-ветка');
  });

  it('a file lies in exactly one list', async () => {
    const first = await lists.create(ROOT, 'the first');
    const second = await lists.create(ROOT, 'the second');
    await lists.move(ROOT, first.id, ['src/a.ts']);
    await lists.move(ROOT, second.id, ['src/a.ts']);

    const now = await lists.read(ROOT);
    expect(now.find((one) => one.id === first.id)!.files).toEqual([]);
    expect(now.find((one) => one.id === second.id)!.files).toEqual(['src/a.ts']);
  });

  it('`changes` holds no paths: it is "everything else"', async () => {
    const mine = await lists.create(ROOT, 'mine');
    await lists.move(ROOT, mine.id, ['src/a.ts']);
    await lists.move(ROOT, DEFAULT_LIST, ['src/a.ts']);

    const now = await lists.read(ROOT);
    expect(now.find((one) => one.id === DEFAULT_LIST)!.files).toEqual([]);
    expect(now.find((one) => one.id === mine.id)!.files, 'it has left the previous one').toEqual([]);
  });

  it('moving ONE file does not carry the rest out of the list', async () => {
    const mine = await lists.create(ROOT, 'mine');
    await lists.move(ROOT, mine.id, ['a.ts', 'b.ts']);
    await lists.move(ROOT, DEFAULT_LIST, ['a.ts']);

    const now = await lists.read(ROOT);
    expect(now.find((one) => one.id === mine.id)!.files).toEqual(['b.ts']);
  });

  it('the reserved ones can be neither removed nor renamed', async () => {
    await expect(lists.remove(ROOT, DEFAULT_LIST)).rejects.toThrow();
    await expect(lists.remove(ROOT, UNRESOLVED_LIST)).rejects.toThrow();
    await expect(lists.rename(ROOT, DEFAULT_LIST, 'otherwise')).rejects.toThrow();
  });

  it('a removed list does not carry the files off: they go back to "everything else"', async () => {
    const mine = await lists.create(ROOT, 'mine');
    await lists.move(ROOT, mine.id, ['src/a.ts']);
    await lists.remove(ROOT, mine.id);
    expect((await lists.read(ROOT)).map((one) => one.id)).toEqual([DEFAULT_LIST, UNRESOLVED_LIST]);
  });

  it('two lists with one name are a legitimate state, and their ids differ', async () => {
    const first = await lists.create(ROOT, 'mine');
    const second = await lists.create(ROOT, 'mine');
    expect(first.id).not.toBe(second.id);
  });

  it('a broken file does not bring the panel down: the lists are read as empty', async () => {
    const file = lists.fileFor(ROOT);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '{ this is not json', 'utf8');
    expect((await lists.read(ROOT)).map((one) => one.id)).toEqual([DEFAULT_LIST, UNRESOLVED_LIST]);
  });

  it('two projects with the same directory name have different lists', async () => {
    expect(lists.fileFor('/one/web-ide')).not.toBe(lists.fileFor('/two/web-ide'));
  });
});
