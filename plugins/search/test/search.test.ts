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
