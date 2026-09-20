import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VisitsStore } from '../src/store.js';

const visitsStore = new VisitsStore();

/**
 * The visit history on disk. We check exactly what it is read through the server for in
 * the first place: dead rows must not survive as far as the user, and two projects'
 * histories must not mix.
 */

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

describe('the visit history', () => {
  it('survives a restart', async () => {
    await visitsStore.save(state, root, [{ path: 'alive.ts', line: 7 }]);
    expect(await visitsStore.load(state, root)).toEqual([{ path: 'alive.ts', line: 7 }]);
  });

  it('a row whose file has vanished drops out', async () => {
    await visitsStore.save(state, root, [
      { path: 'alive.ts', line: 1 },
      { path: 'gone.ts', line: 1 },
    ]);
    expect(await visitsStore.load(state, root)).toEqual([{ path: 'alive.ts', line: 1 }]);
  });

  it('nothing longer than the limit is kept', async () => {
    const many = Array.from({ length: visitsStore.limit * 2 }, () => ({ path: 'alive.ts', line: 1 }));
    await visitsStore.save(state, root, many);
    expect(await visitsStore.load(state, root)).toHaveLength(visitsStore.limit);
  });

  it('two projects have different histories', async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-proj-'));
    await fs.writeFile(path.join(other, 'alive.ts'), '', 'utf8');
    await visitsStore.save(state, root, [{ path: 'alive.ts', line: 1 }]);
    await visitsStore.save(state, other, [{ path: 'alive.ts', line: 99 }]);
    expect((await visitsStore.load(state, root))[0]!.line).toBe(1);
    expect((await visitsStore.load(state, other))[0]!.line).toBe(99);
    await fs.rm(other, { recursive: true, force: true });
  });

  it('a corrupt file does not bring the reading down', async () => {
    for (const file of await fs.readdir(state)) {
      await fs.writeFile(path.join(state, file), 'not json', 'utf8');
    }
    expect(await visitsStore.load(state, root)).toEqual([]);
  });
});
