import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Browse } from '../src/browse.js';

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

describe('дерево выбора проекта', () => {
  it('без ограничения не теряет ни одной папки', async () => {
    const all = await browse.suggestDirectories(`${home}${path.sep}`, Number.POSITIVE_INFINITY, 1);
    expect(all).toHaveLength(COUNT + 1);
    expect(all.map((item) => item.name)).toContain('WebstormProjects');
  });

  it('внутрь заглядывает только у первых, но показывает всех', async () => {
    const all = await browse.suggestDirectories(`${home}${path.sep}`, Number.POSITIVE_INFINITY, 2);
    expect(all).toHaveLength(COUNT + 1);
    expect(all[0]!.children).toEqual([{ path: path.join(home, 'dir-00', 'inside'), name: 'inside' }]);
    expect(all.at(-1)!.children).toBeUndefined();
  });

  it('подсказки по набранному по-прежнему короткие', async () => {
    const page = await browse.suggestDirectories(`${home}${path.sep}`, 24, 1);
    expect(page).toHaveLength(24);
  });

  it('по умолчанию НЕ режет — резать просят явно', async () => {
    const all = await browse.suggestDirectories(`${home}${path.sep}`);
    expect(all).toHaveLength(COUNT + 1);
  });
});
