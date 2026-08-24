import { beforeEach, describe, expect, it } from 'vitest';
import { dirChildren, expanded } from '../src/state/session.js';
import { revealInTree, treeFocus, treeSelection } from '../src/state/tree-ops.js';

const FILE = 'client/src/state/persist.ts';
const DIRS = ['client', 'client/src', 'client/src/state'];

function ready(): void {
  const children = new Map<string, never[]>();
  for (const dir of ['', ...DIRS]) children.set(dir, []);
  dirChildren.value = children as never;
  expanded.value = new Set(DIRS);
  treeSelection.value = new Set([FILE]);
  treeFocus.value = FILE;
}

beforeEach(() => {
  dirChildren.value = new Map();
  expanded.value = new Set();
  treeSelection.value = new Set();
  treeFocus.value = null;
});

describe('наведение дерева', () => {
  it('на уже наведённое НЕ пишет ни одного сигнала', async () => {
    ready();
    const before = {
      expanded: expanded.value,
      selection: treeSelection.value,
      children: dirChildren.value,
    };
    await revealInTree(FILE);
    expect(expanded.value).toBe(before.expanded);
    expect(treeSelection.value).toBe(before.selection);
    expect(dirChildren.value).toBe(before.children);
  });

  it('раскрывает весь путь и подсвечивает файл', async () => {
    const children = new Map<string, never[]>();
    for (const dir of ['', ...DIRS]) children.set(dir, []);
    dirChildren.value = children as never;

    await revealInTree(FILE);
    for (const dir of DIRS) expect(expanded.value.has(dir), dir).toBe(true);
    expect(treeFocus.value).toBe(FILE);
    expect([...treeSelection.value]).toEqual([FILE]);
  });

  it('раскрывает только недостающие папки', async () => {
    const children = new Map<string, never[]>();
    for (const dir of ['', ...DIRS]) children.set(dir, []);
    dirChildren.value = children as never;
    expanded.value = new Set(['client', 'docs']);

    await revealInTree(FILE);
    expect(expanded.value.has('docs')).toBe(true);
    expect(expanded.value.has('client/src/state')).toBe(true);
  });

  it('файл в корне не требует раскрывать ничего', async () => {
    dirChildren.value = new Map([['', []]]) as never;
    await revealInTree('README.md');
    expect(treeFocus.value).toBe('README.md');
    expect(expanded.value.size).toBe(0);
  });
});
