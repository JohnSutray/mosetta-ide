import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals';
import { Grep } from '../src/grep.js';
import { FindFiles } from '../src/files.js';

const grep = new Grep();
const plain = (query: string) => grep.pattern({ query, regex: false, caseSensitive: false, words: false })!;

describe('маски файлов', () => {
  it('без косой черты — по имени, с ней — по пути', () => {
    const ts = grep.masks(['*.ts']);
    expect(ts('src/a.ts')).toBe(true);
    expect(ts('src/a.tsx')).toBe(false);
    const src = grep.masks(['src/**']);
    expect(src('src/deep/a.ts')).toBe(true);
    expect(src('lib/a.ts')).toBe(false);
  });

  it('несколько масок — любая из них; пусто — всё', () => {
    const both = grep.masks(['*.ts', '*.tsx']);
    expect(both('a.tsx')).toBe(true);
    expect(both('a.md')).toBe(false);
    expect(grep.masks([])('anything')).toBe(true);
    expect(grep.masks(['  '])('anything')).toBe(true);
  });
});

describe('совпадения', () => {
  it('строка, колонки и текст строки; перенос в искомом находится', () => {
    const hits = grep.scan('a.txt', 'foo bar\nbaz foo\n', plain('foo'), 10);
    expect(hits).toEqual([
      { path: 'a.txt', line: 0, from: 0, to: 3, text: 'foo bar' },
      { path: 'a.txt', line: 1, from: 4, to: 7, text: 'baz foo' },
    ]);
    expect(grep.scan('a', 'a\nb a\nb', plain('a\nb'), 10)).toHaveLength(2);
  });

  it('буквальный поиск не читает точку как «что угодно», регулярка — читает', () => {
    expect(grep.scan('a', 'a.b axb', plain('a.b'), 10)).toHaveLength(1);
    const re = grep.pattern({ query: 'a.b', regex: true, caseSensitive: false, words: false })!;
    expect(grep.scan('a', 'a.b axb', re, 10)).toHaveLength(2);
    expect(grep.pattern({ query: '(', regex: true, caseSensitive: false, words: false })).toBe(null);
  });

  it('целые слова и регистр', () => {
    const words = grep.pattern({ query: 'ab', regex: false, caseSensitive: false, words: true })!;
    expect(grep.scan('a', 'ab xab AB', words, 10)).toHaveLength(2);
    const strict = grep.pattern({ query: 'ab', regex: false, caseSensitive: true, words: false })!;
    expect(grep.scan('a', 'ab xab AB', strict, 10)).toHaveLength(2);
  });

  it('потолок держится и пустое совпадение не зацикливает', () => {
    expect(grep.scan('a', 'aaaa', plain('a'), 2)).toHaveLength(2);
    const empty = grep.pattern({ query: 'x*', regex: true, caseSensitive: false, words: false })!;
    expect(grep.scan('a', 'abc', empty, 10)).toHaveLength(0);
  });
});

describe('замена', () => {
  it('буквально — доллар остаётся долларом; регуляркой — группы работают', () => {
    expect(grep.replace('a b', plain('a'), '$&$1', false)).toBe('$&$1 b');
    const re = grep.pattern({ query: '(\\w+) (\\w+)', regex: true, caseSensitive: false, words: false })!;
    expect(grep.replace('a b', re, '$2 $1', true)).toBe('b a');
    expect(grep.count('aXa', plain('a'))).toBe(2);
  });
});

describe('чипы масок', () => {
  it('Enter добавляет, крестик снимает, повтор и пустота молчат — и всё через настройку', async () => {
    const masks = signal<string[]>(['*.ts']);
    const saved: string[][] = [];
    const remote = {
      grep: async () => ({ hits: [], files: 0, total: 0, truncated: false }),
      replace: async () => ({ files: 0, replaced: 0 }),
    };
    const files = new FindFiles(
      remote,
      masks,
      async (list) => {
        saved.push(list);
        masks.value = list;
      },
      () => undefined,
    );
    files.maskDraft.value = ' *.tsx ';
    files.addMask();
    await Promise.resolve();
    expect(masks.value).toEqual(['*.ts', '*.tsx']);
    files.maskDraft.value = '*.ts';
    files.addMask();
    files.maskDraft.value = '';
    files.addMask();
    await Promise.resolve();
    expect(saved).toHaveLength(1);
    files.removeMask('*.ts');
    await Promise.resolve();
    expect(masks.value).toEqual(['*.tsx']);
    expect(files.ask().masks).toEqual(['*.tsx']);
  });

  it('Tab ходит по полям, в режиме замены — через поле замены', () => {
    const files = new FindFiles(
      { grep: async () => ({ hits: [], files: 0, total: 0, truncated: false }), replace: async () => ({ files: 0, replaced: 0 }) },
      signal<string[]>([]),
      async () => undefined,
      () => undefined,
    );
    files.show('find');
    expect(files.focus.value.field).toBe('query');
    files.nextField();
    expect(files.focus.value.field).toBe('mask');
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
