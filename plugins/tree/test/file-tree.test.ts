import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost, type FakeSurface } from '@mosetta/ide-api/testing';
import type { DirEntry } from '@mosetta/ide-api/client';
import TreePlugin from '../src/client.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * The tree's memory lives with the plugin. The core hands over the wire — a method and
 * an event — and when to read, when to re-read and when to forget is decided by the
 * plugin. Three things the core's session used to do now have to be done here, and that
 * is exactly what the test guards.
 */
let surface: FakeSurface;
let docs: DocPlugin;
let plugin: TreePlugin;

function entry(path: string, kind: 'file' | 'dir' = 'file'): DirEntry {
  return { path, name: path.split('/').pop() ?? path, kind } as DirEntry;
}

const PROJECT = { id: 'p1', root: '/one', name: 'one' } as never;
const OTHER = { id: 'p2', root: '/two', name: 'two' } as never;

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  (globalThis as Record<string, unknown>)['document'] ??= { addEventListener: () => {} };
  const host = new FakeHost();
  host.add(UiPlugin, '@mosetta/ide-plugin-ui');
  (globalThis as Record<string, unknown>)['document'] ??= {};
  docs = host.add(DocPlugin, '@mosetta/ide-plugin-doc');
  surface = host.surface;
  surface.dirs.set('', [entry('src', 'dir'), entry('README.md')]);
  surface.dirs.set('src', [entry('src/a.ts')]);
  plugin = host.add(TreePlugin, '@mosetta/ide-plugin-tree');
  await host.start();
});

describe('the tree\'s memory lives with the plugin', () => {
  it('the panel gives the keyboard to the tree, and closes only once it is already there', () => {
    const fake = globalThis.document as unknown as { activeElement: unknown };
    fake.activeElement = null;
    expect(plugin.shown.value).toBe(true);
    const asked = plugin.selection.wantsKeyboard.value;
    surface.runCommand('panel.tree');
    expect(plugin.shown.value).toBe(true);
    expect(plugin.selection.wantsKeyboard.value).toBe(asked + 1);
    fake.activeElement = { closest: (selector: string) => (selector === '.tree' ? {} : null) };
    surface.runCommand('panel.tree');
    expect(plugin.shown.value).toBe(false);
    surface.runCommand('panel.tree');
    expect(plugin.shown.value).toBe(true);
    expect(plugin.selection.wantsKeyboard.value).toBe(asked + 2);
    fake.activeElement = null;
  });

  it('the open file\'s directory can be collapsed and selected: the reveal does not jerk', async () => {
    surface.workspaceCurrent.value = PROJECT;
    surface.project.value = PROJECT;
    surface.docs.texts.set('src/a.ts', 'one');
    await settle();
    await docs.openFile('src/a.ts');
    await settle();
    expect(plugin.files.expanded.value.has('src')).toBe(true);
    expect([...plugin.selection.picked.value]).toEqual(['src/a.ts']);

    plugin.selection.only('src');
    await plugin.files.toggle('src');
    await settle();
    expect(plugin.files.expanded.value.has('src')).toBe(false);
    expect([...plugin.selection.picked.value]).toEqual(['src']);
  });

  it('the root is read once the tab has ATTACHED to a project', async () => {
    expect(surface.treeLoads).toEqual([]);
    surface.workspaceCurrent.value = PROJECT;
    surface.project.value = PROJECT;
    await settle();
    expect(surface.treeLoads).toEqual(['']);
    expect(plugin.files.children.value.get('')?.map((e) => e.path)).toEqual(['src', 'README.md']);
  });

  it('"the directory changed" re-reads only what was read', async () => {
    surface.workspaceCurrent.value = PROJECT;
    surface.project.value = PROJECT;
    await settle();
    surface.dirs.set('', [entry('README.md')]);
    surface.changeTree('src');     surface.changeTree('');
    await settle();
    expect(surface.treeLoads).toEqual(['', '']);
    expect(plugin.files.children.value.get('')?.map((e) => e.path)).toEqual(['README.md']);
  });

  it('changing project resets what was expanded, a dropped socket does not', async () => {
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
