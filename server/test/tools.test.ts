import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectPackageManagers, packageManager } from '../src/env/tools.js';

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-tools-'));
  await fs.mkdir(path.join(root, 'node_modules', '.bin'), { recursive: true });
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('чем запускать скрипты', () => {
  it('локфайл решает, когда человек не выбрал', () => {
    expect(packageManager((file) => file === 'pnpm-lock.yaml')).toBe('pnpm');
    expect(packageManager((file) => file === 'yarn.lock')).toBe('yarn');
    expect(packageManager((file) => file === 'bun.lockb')).toBe('bun');
    expect(packageManager(() => false)).toBe('npm');
  });

  it('выбор человека сильнее локфайла', () => {
    const list = detectPackageManagers('pnpm', 'yarn', root);
    expect(list.find((item) => item.current)?.name).toBe('yarn');
    expect(list.find((item) => item.suggested)?.name).toBe('pnpm');
  });

  it('просимый проектом виден, даже если его на машине нет', () => {
    const list = detectPackageManagers('bun', '', root);
    const bun = list.find((item) => item.name === 'bun');
    expect(bun, 'просимый менеджер пропал из списка').toBeDefined();
    expect(bun!.suggested).toBe(true);
    expect(bun!.current).toBe(true);
  });

  it('свой путь попадает в список, даже если он ни на что не похож', () => {
    const weird = path.join(root, 'my-runner');
    const list = detectPackageManagers('npm', weird, root);
    const mine = list.find((item) => item.path === weird);
    expect(mine?.current).toBe(true);
    expect(mine?.name).toBe('my-runner');
  });

  it('локальный шим находится', async () => {
    const shim = path.join(root, 'node_modules', '.bin', 'yarn');
    await fs.writeFile(shim, '#!/bin/sh\n', 'utf8');
    const list = detectPackageManagers('npm', '', root);
    expect(list.some((item) => item.path === shim)).toBe(true);
  });
});
