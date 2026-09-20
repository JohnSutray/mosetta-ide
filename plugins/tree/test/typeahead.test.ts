import { beforeEach, describe, expect, it } from 'vitest';
import type { DirEntry } from '@mosetta/ide-api/client';
import { FileTree } from '../src/file-tree.js';
import { TreeSelection } from '../src/state.js';
import { Typeahead } from '@mosetta/ide-plugin-ui';
import { layout } from '@mosetta/ide-plugin-search';

function entry(path: string, kind: 'file' | 'dir' = 'file'): DirEntry {
  return { path, name: path.split('/').pop() ?? path, kind } as DirEntry;
}

let selection: TreeSelection;
let find: Typeahead;

beforeEach(() => {
  const files = new FileTree({ list: async () => [], onChanged: () => () => {} }, () => {});
  const children = new Map<string, DirEntry[]>();
  children.set('', [entry('client', 'dir'), entry('code', 'dir'), entry('config', 'dir'), entry('README.md')]);
  children.set('client', [entry('client/src', 'dir'), entry('client/package.json')]);
  children.set('client/src', [entry('client/src/main.tsx')]);
  files.children.value = children as never;
  files.expanded.value = new Set(['client']);
  selection = new TreeSelection(files);
  find = new Typeahead(
    {
      order: () => selection.visibleOrder(),
      current: () => selection.focus.value,
      go: (path) => selection.only(path),
      nameOf: (path) => path.slice(path.lastIndexOf('/') + 1),
    },
    () => layout,
  );
});

describe('поиск по дереву буквами', () => {
  it('на каждую букву прыгает к ближайшему по началу имени, текущую не бросает', () => {
    find.type('c');
    expect(selection.focus.value).toBe('client');
    find.type('co');
    expect(selection.focus.value).toBe('code');
    find.type('con');
    expect(selection.focus.value).toBe('config');
    find.type('conf');
    expect(selection.focus.value).toBe('config');
  });

  it('середина имени тоже находится, но после начала', () => {
    find.type('ack');
    expect(selection.focus.value).toBe('client/package.json');
    find.type('re');
    expect(selection.focus.value).toBe('README.md');
  });

  it('ищет только среди показанного: свёрнутая папка молчит', () => {
    find.type('main');
    expect(selection.focus.value).toBe(null);
    expect(find.match('main.tsx')).toEqual([0, 4]);
  });

  it('набранное в русской раскладке находит английское имя (ADR-0199)', () => {
    find.type('сдшуте');
    expect(selection.focus.value).toBe('client');
    expect(find.found.value).toBe(true);
    expect(find.match('client')).toEqual([0, 6]);
  });

  it('говорит, нашлось ли: по этому краснеет рамка (ADR-0199)', () => {
    find.type('co');
    expect(find.found.value).toBe(true);
    find.type('щщщ');
    expect(find.found.value).toBe(false);
    find.type('');
    expect(find.found.value).toBe(true);
  });

  it('стрелки при набранном ходят по совпадениям по кругу', () => {
    find.type('c');
    expect(selection.focus.value).toBe('client');
    find.move(1);
    expect(selection.focus.value).toBe('client/src');
    find.move(1);
    expect(selection.focus.value).toBe('client/package.json');
    find.move(1);
    expect(selection.focus.value).toBe('code');
    find.move(-1);
    expect(selection.focus.value).toBe('client/package.json');
  });

  it('стёрли всё — выделение на месте, подсветки нет', () => {
    find.type('co');
    find.type('');
    expect(selection.focus.value).toBe('code');
    expect(find.match('code')).toBe(null);
    find.clear();
    expect(find.term.value).toBe('');
  });
});
