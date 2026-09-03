import { beforeEach, describe, expect, it } from 'vitest';
import { FakeFileTree } from '@ide/api/testing';
import { TreeSelection } from '../src/state.js';

let files: FakeFileTree;
let tree: TreeSelection;

const FILE = 'client/src/state/persist.ts';
const DIRS = ['client', 'client/src', 'client/src/state'];

function known(): void {
  const children = new Map<string, never[]>();
  for (const dir of ['', ...DIRS]) children.set(dir, []);
  files.children.value = children as never;
}

beforeEach(() => {
  files = new FakeFileTree();
  tree = new TreeSelection(files);
});

describe('наведение дерева', () => {
  it('на уже наведённое НЕ пишет ни одного сигнала', async () => {
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

  it('раскрывает весь путь и подсвечивает файл', async () => {
    known();
    await tree.reveal(FILE);
    for (const dir of DIRS) expect(files.expanded.value.has(dir), dir).toBe(true);
    expect(tree.focus.value).toBe(FILE);
    expect([...tree.picked.value]).toEqual([FILE]);
  });

  it('раскрывает только недостающие папки', async () => {
    known();
    files.expanded.value = new Set(['client', 'docs']);
    await tree.reveal(FILE);
    expect(files.expanded.value.has('docs')).toBe(true);
    expect(files.expanded.value.has('client/src/state')).toBe(true);
  });

  it('файл в корне не требует раскрывать ничего', async () => {
    files.children.value = new Map([['', []]]) as never;
    await tree.reveal('README.md');
    expect(tree.focus.value).toBe('README.md');
    expect(files.expanded.value.size).toBe(0);
  });

  it('папки, которых память ещё не читала, дочитываются', async () => {
    files.children.value = new Map([['', []]]) as never;
    await tree.reveal(FILE);
    expect(files.loads).toEqual(DIRS);
    expect(tree.focus.value).toBe(FILE);
  });
});
