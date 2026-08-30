import { beforeEach, describe, expect, it } from 'vitest';
import { rpc } from '../src/state/session.js';
import { FileTree } from '../src/state/file-tree.js';
import { TreeSelection } from '../src/state/tree-ops.js';

const files = new FileTree(rpc);
const tree = new TreeSelection(files);

const FILE = 'client/src/state/persist.ts';
const DIRS = ['client', 'client/src', 'client/src/state'];

function ready(): void {
  const children = new Map<string, never[]>();
  for (const dir of ['', ...DIRS]) children.set(dir, []);
  files.children.value = children as never;
  files.expanded.value = new Set(DIRS);
  tree.picked.value = new Set([FILE]);
  tree.focus.value = FILE;
}

beforeEach(() => {
  files.children.value = new Map();
  files.expanded.value = new Set();
  tree.picked.value = new Set();
  tree.focus.value = null;
});

describe('наведение дерева', () => {
  it('на уже наведённое НЕ пишет ни одного сигнала', async () => {
    ready();
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
    const children = new Map<string, never[]>();
    for (const dir of ['', ...DIRS]) children.set(dir, []);
    files.children.value = children as never;

    await tree.reveal(FILE);
    for (const dir of DIRS) expect(files.expanded.value.has(dir), dir).toBe(true);
    expect(tree.focus.value).toBe(FILE);
    expect([...tree.picked.value]).toEqual([FILE]);
  });

  it('раскрывает только недостающие папки', async () => {
    const children = new Map<string, never[]>();
    for (const dir of ['', ...DIRS]) children.set(dir, []);
    files.children.value = children as never;
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
});
