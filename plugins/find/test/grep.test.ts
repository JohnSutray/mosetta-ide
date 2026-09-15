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

describe('чипы масок и исключений', () => {
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

  it('Enter добавляет, крестик снимает, повтор и пустота молчат — и всё через настройку', async () => {
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

  it('Enter правит ТОТ ряд, где стоит каретка (ADR-0232)', async () => {
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

  it('выключенное исключение перестаёт исключать', async () => {
    const excludes = row(['*.min.js']);
    const files = new FindFiles(remote, row().wire, excludes.wire, () => undefined, docs);
    expect(files.ask().excludes).toEqual(['*.min.js']);
    files.excludes.toggle('*.min.js');
    await Promise.resolve();
    expect(files.ask().excludes).toEqual([]);
  });

  it('Tab ходит по полям, в режиме замены — через поле замены', () => {
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
