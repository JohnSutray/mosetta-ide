import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VisitsStore } from '../src/store.js';

const visitsStore = new VisitsStore();

let state: string;
let root: string;

beforeAll(async () => {
  state = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-state-'));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-proj-'));
  await fs.writeFile(path.join(root, 'alive.ts'), 'export {}\n', 'utf8');
});

afterAll(async () => {
  await fs.rm(state, { recursive: true, force: true });
  await fs.rm(root, { recursive: true, force: true });
});

describe('история посещений', () => {
  it('переживает перезапуск', async () => {
    await visitsStore.save(state, root, [{ path: 'alive.ts', line: 7 }]);
    expect(await visitsStore.load(state, root)).toEqual([{ path: 'alive.ts', line: 7 }]);
  });

  it('строка с исчезнувшим файлом выпадает', async () => {
    await visitsStore.save(state, root, [
      { path: 'alive.ts', line: 1 },
      { path: 'gone.ts', line: 1 },
    ]);
    expect(await visitsStore.load(state, root)).toEqual([{ path: 'alive.ts', line: 1 }]);
  });

  it('длиннее лимита не хранится', async () => {
    const many = Array.from({ length: visitsStore.limit * 2 }, () => ({ path: 'alive.ts', line: 1 }));
    await visitsStore.save(state, root, many);
    expect(await visitsStore.load(state, root)).toHaveLength(visitsStore.limit);
  });

  it('у двух проектов истории разные', async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-proj-'));
    await fs.writeFile(path.join(other, 'alive.ts'), '', 'utf8');
    await visitsStore.save(state, root, [{ path: 'alive.ts', line: 1 }]);
    await visitsStore.save(state, other, [{ path: 'alive.ts', line: 99 }]);
    expect((await visitsStore.load(state, root))[0]!.line).toBe(1);
    expect((await visitsStore.load(state, other))[0]!.line).toBe(99);
    await fs.rm(other, { recursive: true, force: true });
  });

  it('битый файл не роняет чтение', async () => {
    for (const file of await fs.readdir(state)) {
      await fs.writeFile(path.join(state, file), 'не json', 'utf8');
    }
    expect(await visitsStore.load(state, root)).toEqual([]);
  });
});
