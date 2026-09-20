import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Browse } from '../src/browse.js';

/**
 * The project choice tree.
 *
 * We check what made a user's `WebstormProjects` directory vanish "mysteriously" on
 * Windows: the list of the home directory's folders was cut at twenty-four, and the
 * alphabet sends `W` to the very end. Silent truncation looks like "the directory does
 * not exist" — and people go looking for the reason anywhere except in our constant.
 */

let home: string;
const COUNT = 40;
const browse = new Browse();

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-browse-'));
  for (let n = 0; n < COUNT; n += 1) {
    const dir = path.join(home, `dir-${String(n).padStart(2, '0')}`);
    await fs.mkdir(path.join(dir, 'inside'), { recursive: true });
  }
  await fs.mkdir(path.join(home, 'WebstormProjects'));
});

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe('the project choice tree', () => {
  it('without a limit it loses not one directory', async () => {
    const all = await browse.suggestDirectories(`${home}${path.sep}`, Number.POSITIVE_INFINITY, 1);
    expect(all).toHaveLength(COUNT + 1);
    expect(all.map((item) => item.name)).toContain('WebstormProjects');
  });

  it('it looks inside only the first few, but shows them all', async () => {
    const all = await browse.suggestDirectories(`${home}${path.sep}`, Number.POSITIVE_INFINITY, 2);
    expect(all).toHaveLength(COUNT + 1);
    expect(all[0]!.children).toEqual([{ path: path.join(home, 'dir-00', 'inside'), name: 'inside' }]);
    expect(all.at(-1)!.children).toBeUndefined();
  });

  it('the suggestions for what was typed stay short', async () => {
    const page = await browse.suggestDirectories(`${home}${path.sep}`, 24, 1);
    expect(page).toHaveLength(24);
  });

  it('by default it does NOT cut — cutting is asked for explicitly', async () => {
    const all = await browse.suggestDirectories(`${home}${path.sep}`);
    expect(all).toHaveLength(COUNT + 1);
  });
});
