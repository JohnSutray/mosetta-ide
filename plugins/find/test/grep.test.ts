import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals';
import { Grep } from '../src/grep.js';
import { FindFiles } from '../src/files.js';

/**
 * Search across the project. The mechanics are pure: no disk and no memory — the texts
 * are supplied by the test, and what is checked are the promises: a mask means what it
 * says, a literal search does not read a `$` as a group, a line break in the term is
 * found, and the mask chips are a setting and are written as a setting.
 */
const grep = new Grep();
const plain = (query: string) => grep.pattern({ query, regex: false, caseSensitive: false, words: false })!;

describe('file masks', () => {
  it('without a slash by name, with one by path', () => {
    const ts = grep.masks(['*.ts']);
    expect(ts('src/a.ts')).toBe(true);
    expect(ts('src/a.tsx')).toBe(false);
    const src = grep.masks(['src/**']);
    expect(src('src/deep/a.ts')).toBe(true);
    expect(src('lib/a.ts')).toBe(false);
  });

  it('several masks mean any of them; empty means everything', () => {
    const both = grep.masks(['*.ts', '*.tsx']);
    expect(both('a.tsx')).toBe(true);
    expect(both('a.md')).toBe(false);
    expect(grep.masks([])('anything')).toBe(true);
    expect(grep.masks(['  '])('anything')).toBe(true);
  });
});

describe('matches', () => {
  it('the line, the columns and the line\'s text; a newline in the term is found', () => {
    const hits = grep.scan('a.txt', 'foo bar\nbaz foo\n', plain('foo'), 10);
    expect(hits).toEqual([
      { path: 'a.txt', line: 0, from: 0, to: 3, text: 'foo bar' },
      { path: 'a.txt', line: 1, from: 4, to: 7, text: 'baz foo' },
    ]);
    expect(grep.scan('a', 'a\nb a\nb', plain('a\nb'), 10)).toHaveLength(2);
  });

  it('a literal search does not read a dot as "anything", a regex does', () => {
    expect(grep.scan('a', 'a.b axb', plain('a.b'), 10)).toHaveLength(1);
    const re = grep.pattern({ query: 'a.b', regex: true, caseSensitive: false, words: false })!;
    expect(grep.scan('a', 'a.b axb', re, 10)).toHaveLength(2);
    expect(grep.pattern({ query: '(', regex: true, caseSensitive: false, words: false })).toBe(null);
  });

  it('whole words and case', () => {
    const words = grep.pattern({ query: 'ab', regex: false, caseSensitive: false, words: true })!;
    expect(grep.scan('a', 'ab xab AB', words, 10)).toHaveLength(2);
    const strict = grep.pattern({ query: 'ab', regex: false, caseSensitive: true, words: false })!;
    expect(grep.scan('a', 'ab xab AB', strict, 10)).toHaveLength(2);
  });

  it('the ceiling holds, and an empty match does not loop', () => {
    expect(grep.scan('a', 'aaaa', plain('a'), 2)).toHaveLength(2);
    const empty = grep.pattern({ query: 'x*', regex: true, caseSensitive: false, words: false })!;
    expect(grep.scan('a', 'abc', empty, 10)).toHaveLength(0);
  });
});

describe('replacement', () => {
  it('literally, a dollar stays a dollar; by regex, the groups work', () => {
    expect(grep.replace('a b', plain('a'), '$&$1', false)).toBe('$&$1 b');
    const re = grep.pattern({ query: '(\\w+) (\\w+)', regex: true, caseSensitive: false, words: false })!;
    expect(grep.replace('a b', re, '$2 $1', true)).toBe('b a');
    expect(grep.count('aXa', plain('a'))).toBe(2);
  });
});

describe('the mask and exclusion chips', () => {
  /** A row of chips as the state sees it: the setting live, and the writing into it. */
  function row(initial: string[] = []) {
    const all = signal<string[]>(initial);
    const off = signal<string[]>([]);
    const saved: string[][] = [];
    return {
      all,
      off,
      saved,
      wire: {
        all,
        off,
        saveAll: async (list: string[]) => {
          saved.push(list);
          all.value = list;
        },
        saveOff: async (list: string[]) => {
          off.value = list;
        },
      },
    };
  }

  const remote = {
    grep: async () => ({ hits: [], files: 0, total: 0, truncated: false, skipped: 0 }),
    replace: async () => ({ files: 0, replaced: 0 }),
  };
  const docs = () => ({ goTo: async () => undefined, peekFile: async (path: string) => ({ path, text: '' }) });

  it('Enter adds, the cross removes, a duplicate and emptiness stay silent — and all of it through the setting', async () => {
    const masks = row(['*.ts']);
    const files = new FindFiles(remote, masks.wire, row().wire, () => undefined, docs);

    files.masks.draft.value = ' *.tsx ';
    files.addMask();
    await Promise.resolve();
    expect(masks.all.value).toEqual(['*.ts', '*.tsx']);
    files.masks.draft.value = '*.ts';
    files.addMask();
    files.masks.draft.value = '';
    files.addMask();
    await Promise.resolve();
    expect(masks.saved).toHaveLength(1);
    files.masks.remove('*.ts');
    await Promise.resolve();
    expect(masks.all.value).toEqual(['*.tsx']);
    expect(files.ask().masks).toEqual(['*.tsx']);
    files.masks.toggle('*.tsx');
    await Promise.resolve();
    expect(files.masks.isOff('*.tsx')).toBe(true);
    expect(files.ask().masks).toEqual([]);
    files.masks.toggle('*.tsx');
    await Promise.resolve();
    expect(files.ask().masks).toEqual(['*.tsx']);
  });

  it('Enter edits THE row the caret is in', async () => {
    const masks = row();
    const excludes = row();
    const files = new FindFiles(remote, masks.wire, excludes.wire, () => undefined, docs);

    files.focusOn('mask');
    files.masks.draft.value = '*.ts';
    files.addMask();
    await Promise.resolve();
    expect(masks.all.value).toEqual(['*.ts']);

    files.focusOn('exclude');
    files.excludes.draft.value = '*.min.js';
    files.addMask();
    await Promise.resolve();
    expect(excludes.all.value).toEqual(['*.min.js']);
    expect(masks.all.value).toEqual(['*.ts']);
    expect(files.ask().excludes).toEqual(['*.min.js']);
  });

  it('a disabled exclusion stops excluding', async () => {
    const excludes = row(['*.min.js']);
    const files = new FindFiles(remote, row().wire, excludes.wire, () => undefined, docs);
    expect(files.ask().excludes).toEqual(['*.min.js']);
    files.excludes.toggle('*.min.js');
    await Promise.resolve();
    expect(files.ask().excludes).toEqual([]);
  });

  it('Tab walks the fields, and in replace mode through the replacement field', () => {
    const files = new FindFiles(remote, row().wire, row().wire, () => undefined, docs);
    files.show('find');
    expect(files.focus.value.field).toBe('query');
    files.nextField();
    expect(files.focus.value.field).toBe('mask');
    files.nextField();
    expect(files.focus.value.field).toBe('exclude');
    files.nextField();
    expect(files.focus.value.field).toBe('query');
    files.show('replace');
    files.nextField();
    expect(files.focus.value.field).toBe('replace');
    files.toggle('find');
    expect(files.open.value).toBe(true);
    expect(files.mode.value).toBe('find');
    files.toggle('find');
    expect(files.open.value).toBe(false);
  });
});
