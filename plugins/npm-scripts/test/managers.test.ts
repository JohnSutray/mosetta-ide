import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PackageManagers } from '../src/managers.js';

/**
 * Package managers. We check what is settled by arithmetic rather than by whether pnpm
 * happens to be installed on the checker's machine: whose choice wins, and what happens
 * to a manager that is asked for and absent. PATH is substituted: it holds only `pnpm`
 * and `npm`.
 */

let root: string;
const onPath = new Set(['pnpm', 'npm']);
const tools = new PackageManagers((name) => (onPath.has(name) ? `/usr/bin/${name}` : null));

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-tools-'));
  await fs.mkdir(path.join(root, 'node_modules', '.bin'), { recursive: true });
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('what to run scripts with', () => {
  it('the lockfile decides when the user has not chosen', () => {
    expect(tools.suggested((file) => file === 'pnpm-lock.yaml')).toBe('pnpm');
    expect(tools.suggested((file) => file === 'yarn.lock')).toBe('yarn');
    expect(tools.suggested((file) => file === 'bun.lockb')).toBe('bun');
    expect(tools.suggested(() => false)).toBe('npm');
    expect(tools.chosen('pnpm', '')).toBe('pnpm');
    expect(tools.chosen('pnpm', ' yarn ')).toBe('yarn');
  });

  it('the user\'s choice beats the lockfile', () => {
    const list = tools.detect('pnpm', 'yarn', root);
    expect(list.find((item) => item.current)?.name).toBe('yarn');
    expect(list.find((item) => item.suggested)?.name).toBe('pnpm');
  });

  it('the one the project asks for is visible even if it is not on the machine', () => {
    const list = tools.detect('bun', '', root);
    const bun = list.find((item) => item.name === 'bun');
    expect(bun, 'the manager being asked for is gone from the list').toBeDefined();
    expect(bun!.suggested).toBe(true);
    expect(bun!.current).toBe(true);
  });

  it('a path of your own reaches the list even if it looks like nothing', () => {
    const weird = path.join(root, 'my-runner');
    const list = tools.detect('npm', weird, root);
    const mine = list.find((item) => item.path === weird);
    expect(mine?.current).toBe(true);
    expect(mine?.name).toBe('my-runner');
  });

  it('a local shim is found', async () => {
    const shim = path.join(root, 'node_modules', '.bin', 'yarn');
    await fs.writeFile(shim, '#!/bin/sh\n', 'utf8');
    const list = tools.detect('npm', '', root);
    expect(list.some((item) => item.path === shim)).toBe(true);
  });
});
