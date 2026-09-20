import { beforeEach, describe, expect, it } from 'vitest';
import type { DirEntry } from '@mosetta/ide-api/client';
import { FileTree } from '../src/file-tree.js';
import { TreeSelection } from '../src/state.js';

/**
 * The tree taking aim at the open file, and the loop that is there.
 *
 * A click in the tree opens a file, an open file calls for a reveal, a reveal touches
 * the selection again. The loop is closed on one path and dies out by itself — but only
 * as long as revealing what is already revealed WRITES no signals. Let it write, and
 * the tree starts redrawing for nothing, while the next feature such as "a click
 * selects the file" will close the loop in earnest.
 *
 * The tree's memory is the real one, the plugin's, on a fake wire: the selection
 * receives it through the constructor, and the test decides what lies in it and what
 * the "server" answers.
 */
let files: FileTree;
let tree: TreeSelection;
let loads: string[];

const FILE = 'client/src/state/persist.ts';
const DIRS = ['client', 'client/src', 'client/src/state'];

function known(): void {
  const children = new Map<string, never[]>();
  for (const dir of ['', ...DIRS]) children.set(dir, []);
  files.children.value = children as never;
}

beforeEach(() => {
  loads = [];
  files = new FileTree(
    {
      list: async (path) => {
        loads.push(path);
        return [] as DirEntry[];
      },
      onChanged: () => () => {},
    },
    () => {},
  );
  tree = new TreeSelection(files);
});

describe('the tree\'s reveal', () => {
  it('revealing what is already revealed writes NOT ONE signal', async () => {
    known();
    files.expanded.value = new Set(DIRS);
    tree.picked.value = new Set([FILE]);
    tree.focus.value = FILE;
    const before = {
      expanded: files.expanded.value,
      selection: tree.picked.value,
      children: files.children.value,
    };
    await tree.reveal(FILE);
    expect(files.expanded.value).toBe(before.expanded);
    expect(tree.picked.value).toBe(before.selection);
    expect(files.children.value).toBe(before.children);
  });

  it('expands the whole path and highlights the file', async () => {
    known();
    await tree.reveal(FILE);
    for (const dir of DIRS) expect(files.expanded.value.has(dir), dir).toBe(true);
    expect(tree.focus.value).toBe(FILE);
    expect([...tree.picked.value]).toEqual([FILE]);
  });

  it('expands only the missing directories', async () => {
    known();
    files.expanded.value = new Set(['client', 'docs']);
    await tree.reveal(FILE);
    expect(files.expanded.value.has('docs')).toBe(true);
    expect(files.expanded.value.has('client/src/state')).toBe(true);
  });

  it('a file in the root needs nothing expanded', async () => {
    files.children.value = new Map([['', []]]) as never;
    await tree.reveal('README.md');
    expect(tree.focus.value).toBe('README.md');
    expect(files.expanded.value.size).toBe(0);
  });

  it('directories the memory has not read yet are read in', async () => {
    files.children.value = new Map([['', []]]) as never;
    await tree.reveal(FILE);
    expect(loads).toEqual(DIRS);
    expect(tree.focus.value).toBe(FILE);
  });
});
