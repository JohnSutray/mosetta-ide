import { beforeEach, describe, expect, it } from 'vitest';
import { dirChildren, expanded } from '../src/state/session.js';
import { TreeSelection } from '../src/state/tree-ops.js';

const tree = new TreeSelection();

const FILE = 'client/src/state/persist.ts';
const DIRS = ['client', 'client/src', 'client/src/state'];

function ready(): void {
  const children = new Map<string, never[]>();
  for (const dir of ['', ...DIRS]) children.set(dir, []);
  dirChildren.value = children as never;
  expanded.value = new Set(DIRS);
  tree.picked.value = new Set([FILE]);
  tree.focus.value = FILE;
}

beforeEach(() => {
  dirChildren.value = new Map();
  expanded.value = new Set();
  tree.picked.value = new Set();
  tree.focus.value = null;
});

describe('наведение дерева', () => {
  it('на уже наведённое НЕ пишет ни одного сигнала', async () => {
    ready();
    const before = {
      expanded: expanded.value,
      selection: tree.picked.value,
      children: dirChildren.value,
    };
    await tree.reveal(FILE);
    expect(expanded.value).toBe(before.expanded);
    expect(tree.picked.value).toBe(before.selection);
    expect(dirChildren.value).toBe(before.children);
  });

  it('раскрывает весь путь и подсвечивает файл', async () => {
    const children = new Map<string, never[]>();
    for (const dir of ['', ...DIRS]) children.set(dir, []);
    dirChildren.value = children as never;

    await tree.reveal(FILE);
    for (const dir of DIRS) expect(expanded.value.has(dir), dir).toBe(true);
    expect(tree.focus.value).toBe(FILE);
    expect([...tree.picked.value]).toEqual([FILE]);
  });

  it('раскрывает только недостающие папки', async () => {
    const children = new Map<string, never[]>();
    for (const dir of ['', ...DIRS]) children.set(dir, []);
    dirChildren.value = children as never;
    expanded.value = new Set(['client', 'docs']);

    await tree.reveal(FILE);
    expect(expanded.value.has('docs')).toBe(true);
    expect(expanded.value.has('client/src/state')).toBe(true);
  });

  it('файл в корне не требует раскрывать ничего', async () => {
    dirChildren.value = new Map([['', []]]) as never;
    await tree.reveal('README.md');
    expect(tree.focus.value).toBe('README.md');
    expect(expanded.value.size).toBe(0);
  });
});
