import { describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '@mosetta/ide-plugin-doc';
import SearchPlugin, { type IndexHit } from '../src/client.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

function hit(kind: string, label: string, path = `${label}.ts`, line?: number): IndexHit {
  return { kind, label, path, line, matches: [], score: 1 };
}

const NAME = '@mosetta/ide-plugin-search';

async function raise() {
  const host = new FakeHost();
  host.add(UiPlugin, '@mosetta/ide-plugin-ui');
  (globalThis as Record<string, unknown>)['document'] ??= {};
  host.add(DocPlugin, '@mosetta/ide-plugin-doc');
  const plugin = host.add(SearchPlugin, NAME);
  const hits: IndexHit[] = [];
  const answers = host.ide(NAME).answers;
  answers.set('search', () => ({ hits, total: hits.length }));
  answers.set('stats', () => ({ files: 0, provided: 0, symbols: 0, vocabulary: 0, pending: 0, unparsed: 0 }));
  await host.start();
  return { host, plugin, search: plugin.search, hits, answers };
}

describe('найти всё', () => {
  it('находки собираются в секции, первый результат остаётся первым', async () => {
    const { search, hits } = await raise();
    hits.push(hit('ts', 'один'), hit('file', 'два'), hit('ts', 'три'), hit('file', 'четыре'));
    search.show();
    search.setQuery('о');
    await new Promise((r) => setTimeout(r, 0));

    const rows = search.rows.value.map((row) => ('header' in row ? `# ${row.header}` : row.hit.label));
    expect(rows).toEqual(['# search.kind.ts', 'один', 'три', '# search.kind.file', 'два', 'четыре']);
  });

  it('окно знает, что показало не всё', async () => {
    const { search, hits, answers } = await raise();
    hits.push(hit('file', 'один'));
    answers.set('search', () => ({ hits, total: 42 }));
    search.show();
    search.setQuery('о');
    await new Promise((r) => setTimeout(r, 0));

    expect(search.hits.value).toHaveLength(1);
    expect(search.total.value).toBe(42);
  });

  it('Enter по скрипту отдаёт находку хозяину сорта, а не открывает файл', async () => {
    const { host, search, hits } = await raise();
    const ran: string[] = [];
    host.registry.add('search.opener', { kind: 'npm', open: (found: { path: string }) => ran.push(found.path) }, '@mosetta/ide-plugin-npm-scripts');
    hits.push(hit('npm', 'dev', 'package.json'));
    search.show();
    search.setQuery('dev');
    await new Promise((r) => setTimeout(r, 0));

    search.accept();
    expect(ran).toEqual(['package.json']);
    expect(host.plugin(DocPlugin).doc.pendingReveal.value).toBeNull();
    expect(search.open.value).toBe(false);
  });

  it('Enter по файлу открывает его на найденной строке', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('ts', 'Foo', 'src/foo.ts', 41));
    host.surface.docs.texts.set('src/foo.ts', '');
    search.show();
    search.setQuery('Foo');
    await new Promise((r) => setTimeout(r, 0));

    search.accept();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.plugin(DocPlugin).doc.pendingReveal.value).toMatchObject({ path: 'src/foo.ts', line: 41 });
  });

  it('клавиша, открывшая окно, его и закрывает', async () => {
    const { host, search } = await raise();
    host.run('search.everywhere');
    expect(search.open.value).toBe(true);
    host.run('search.everywhere');
    expect(search.open.value).toBe(false);
  });

  it('пустое поле занято недавними местами от поставщика', async () => {
    const { host, search } = await raise();
    host.registry.add(
      'search.recent',
      { kind: 'recent', places: () => [{ path: 'src/a.ts', line: 4 }, { path: 'src/b.ts' }] },
      '@mosetta/ide-plugin-visits',
    );
    search.show();
    await new Promise((r) => setTimeout(r, 0));
    const rows = search.rows.value.map((row) => ('header' in row ? `# ${row.header}` : row.hit.label));
    expect(rows).toEqual(['# search.kind.recent', 'src/a.ts', 'src/b.ts']);
    expect(search.hits.value.every((one) => one.matches.length === 0)).toBe(true);
    expect(search.hits.value[0]?.line).toBe(4);
  });

  it('поставщика нет — пустое поле остаётся пустым, и это не поломка', async () => {
    const { search } = await raise();
    search.show();
    await new Promise((r) => setTimeout(r, 0));
    expect(search.hits.value).toEqual([]);
  });

  it('недавних просят ровно столько, сколько велит настройка', async () => {
    const { host, search } = await raise();
    const asked: number[] = [];
    host.registry.add(
      'search.recent',
      {
        kind: 'recent',
        places: (limit: number) => {
          asked.push(limit);
          return Array.from({ length: 40 }, (_, i) => ({ path: `f${i}.ts` }));
        },
      },
      '@mosetta/ide-plugin-visits',
    );
    search.show();
    await new Promise((r) => setTimeout(r, 0));
    expect(asked[0]).toBe(15);
    expect(search.hits.value).toHaveLength(15);
  });

  it('стрелки ходят по кругу', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('ts', 'a'), hit('ts', 'b'));
    search.show();
    search.setQuery('x');
    await new Promise((r) => setTimeout(r, 0));
    host.run('search.next');
    expect(search.selected.value).toBe(1);
    host.run('search.next');
    expect(search.selected.value).toBe(0);
    host.run('search.prev');
    expect(search.selected.value).toBe(1);
  });
});

describe('общак', () => {
  const later = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));

  it('находки источника встают в выдачу рядом со своими', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('file', 'файл', 'файл.ts'));
    host.registry.add(
      'search.source',
      { id: 'sym', kind: 'ts', find: () => [{ ...hit('ts', 'ts::Символ'), score: 9 }] },
      '@mosetta/ide-plugin-symbols',
    );
    search.show();
    search.setQuery('с');
    await later();
    expect(search.hits.value.map((one) => one.label)).toContain('ts::Символ');
  });

  it('опоздавший ответ не переставляет выбранное', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('file', 'файл', 'файл.ts'));
    host.registry.add(
      'search.source',
      { id: 'sym', kind: 'ts', find: () => [{ ...hit('ts', 'ts::Первее'), score: 99 }] },
      '@mosetta/ide-plugin-symbols',
    );
    search.show();
    search.setQuery('ф');
    await new Promise((r) => setTimeout(r, 0));
    const chosen = search.current.value?.label;
    await later();
    expect(search.current.value?.label, 'под кареткой то же, что было').toBe(chosen);
  });

  it('чип заводится по объявленному сорту и выключает источник', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('file', 'файл', 'файл.ts'));
    let asked = 0;
    host.registry.add(
      'search.source',
      {
        id: 'sym',
        kind: 'ts',
        find: () => {
          asked += 1;
          return [{ ...hit('ts', 'ts::Символ'), score: 9 }];
        },
      },
      '@mosetta/ide-plugin-symbols',
    );
    search.show();
    search.setQuery('с');
    await later();
    expect(search.kinds.value, 'чип есть').toContain('ts');
    expect(asked).toBe(1);

    search.toggleKind('ts');
    await later();
    expect(asked, 'выключенный не спрошен').toBe(1);
    expect(search.hits.value.some((one) => one.kind === 'ts')).toBe(false);
    expect(search.kinds.value).toContain('ts');
  });

  it('недавние заводят свой чип и выключаются им же', async () => {
    const { host, search } = await raise();
    host.registry.add(
      'search.recent',
      { kind: 'recent', places: () => [{ path: 'src/a.ts' }] },
      '@mosetta/ide-plugin-visits',
    );
    search.show();
    await later();
    expect(search.kinds.value).toContain('recent');

    search.toggleKind('recent');
    await later();
    expect(search.hits.value).toEqual([]);
    expect(search.kinds.value, 'чип остаётся, иначе его нечем вернуть').toContain('recent');
  });

  it('свёрнутая секция прячет строки, но не себя и не свой счёт', async () => {
    const { search, hits } = await raise();
    hits.push(hit('ts', 'один'), hit('ts', 'два'), hit('file', 'три'));
    search.show();
    search.setQuery('о');
    await later();

    search.toggleSection('ts');
    const rows = search.rows.value.map((row) => ('header' in row ? `# ${row.header} ${row.count}` : row.hit.label));
    expect(rows).toEqual(['# search.kind.ts 2', '# search.kind.file 1', 'три']);
    expect(search.isFolded('ts')).toBe(true);
    expect(search.current.value?.label).toBe('три');

    search.move(1);
    expect(search.current.value?.label).toBe('три');

    search.toggleSection('ts');
    expect(search.rows.value.filter((row) => !('header' in row))).toHaveLength(3);
  });

  it('значок сорта рисует тот, кто сорт принёс', async () => {
    const { host, search, hits } = await raise();
    host.registry.add(
      'search.icon',
      { kind: 'npm', icon: () => 'значок скрипта' },
      '@mosetta/ide-plugin-npm-scripts',
    );
    hits.push(hit('npm', 'dev', 'package.json'), hit('file', 'foo', 'src/foo.ts'));
    search.show();
    search.setQuery('о');
    await later();

    expect(search.iconFor(hits[0]!)).toBe('значок скрипта');
    expect(search.iconFor(hits[1]!)).toBeNull();
  });

  it('поломка источника не роняет выдачу', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('file', 'файл', 'файл.ts'));
    host.registry.add(
      'search.source',
      { id: 'битый', kind: 'x', find: () => Promise.reject(new Error('упал')) },
      '@mosetta/ide-plugin-кто-то',
    );
    search.show();
    search.setQuery('ф');
    await later();
    expect(search.hits.value.map((one) => one.label)).toEqual(['файл']);
  });

  it('источник говорит о своём покрытии сам', async () => {
    const { host, search } = await raise();
    host.registry.add(
      'search.source',
      { id: 'sym', kind: 'ts', find: () => [], note: () => ({ key: 'symbols.partial', params: { count: 7 } }) },
      '@mosetta/ide-plugin-symbols',
    );
    search.show();
    expect(search.notes.value).toEqual([{ key: 'symbols.partial', params: { count: 7 } }]);
  });
});
