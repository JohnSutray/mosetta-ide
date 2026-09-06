import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost, type FakeSurface } from '@ide/api/testing';
import type { DirEntry } from '@ide/api/client';
import TreePlugin from '../src/client.js';

let surface: FakeSurface;
let plugin: TreePlugin;

function entry(path: string, kind: 'file' | 'dir' = 'file'): DirEntry {
  return { path, name: path.split('/').pop() ?? path, kind } as DirEntry;
}

const PROJECT = { id: 'p1', root: '/один', name: 'один' } as never;
const OTHER = { id: 'p2', root: '/два', name: 'два' } as never;

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  (globalThis as Record<string, unknown>)['document'] ??= { addEventListener: () => {} };
  const host = new FakeHost();
  surface = host.surface;
  surface.dirs.set('', [entry('src', 'dir'), entry('README.md')]);
  surface.dirs.set('src', [entry('src/a.ts')]);
  plugin = host.add(TreePlugin, '@ide/plugin-tree');
  await host.start();
});

describe('память дерева у плагина', () => {
  it('корень читается, когда вкладка ПРИКРЕПИЛАСЬ к проекту', async () => {
    expect(surface.treeLoads).toEqual([]);
    surface.workspaceCurrent.value = PROJECT;
    surface.project.value = PROJECT;
    await settle();
    expect(surface.treeLoads).toEqual(['']);
    expect(plugin.files.children.value.get('')?.map((e) => e.path)).toEqual(['src', 'README.md']);
  });

  it('«папка изменилась» перечитывает только прочитанное', async () => {
    surface.workspaceCurrent.value = PROJECT;
    surface.project.value = PROJECT;
    await settle();
    surface.dirs.set('', [entry('README.md')]);
    surface.changeTree('src');
    surface.changeTree('');
    await settle();
    expect(surface.treeLoads).toEqual(['', '']);
    expect(plugin.files.children.value.get('')?.map((e) => e.path)).toEqual(['README.md']);
  });

  it('смена проекта обнуляет раскрытое, разрыв сокета — нет', async () => {
    surface.workspaceCurrent.value = PROJECT;
    surface.project.value = PROJECT;
    await settle();
    await plugin.files.toggle('src');
    expect(plugin.files.expanded.value.has('src')).toBe(true);

    surface.project.value = null;
    surface.project.value = PROJECT;
    await settle();
    expect(plugin.files.expanded.value.has('src')).toBe(true);

    surface.workspaceCurrent.value = OTHER;
    surface.project.value = OTHER;
    await settle();
    expect(plugin.files.expanded.value.size).toBe(0);
    expect(plugin.files.children.value.has('src')).toBe(false);
  });
});
