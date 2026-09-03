import { describe, expect, it } from 'vitest';
import type { IndexHit } from '@ide/protocol';
import { FakeHost } from '@ide/api/testing';
import SearchPlugin from '../src/client.js';

function hit(kind: string, label: string, path = `${label}.ts`, line?: number): IndexHit {
  return { kind, label, path, line, matches: [], score: 1 };
}

async function raise() {
  const host = new FakeHost();
  const plugin = host.add(SearchPlugin, '@ide/plugin-search');
  await host.start();
  return { host, plugin, search: plugin.search };
}

describe('найти всё', () => {
  it('находки собираются в секции, первый результат остаётся первым', async () => {
    const { host, search } = await raise();
    host.surface.hits.push(hit('ts', 'один'), hit('file', 'два'), hit('ts', 'три'), hit('file', 'четыре'));
    search.show();
    search.setQuery('о');
    await new Promise((r) => setTimeout(r, 0));

    const rows = search.rows.value.map((row) => ('header' in row ? `# ${row.header}` : row.hit.label));
    expect(rows).toEqual(['# search.kind.ts', 'один', 'три', '# search.kind.file', 'два', 'четыре']);
  });

  it('Enter по скрипту отдаёт находку хозяину сорта, а не открывает файл', async () => {
    const { host, search } = await raise();
    const ran: string[] = [];
    host.surface.openers.set('npm', (found) => ran.push(found.path));
    host.surface.hits.push(hit('npm', 'dev', 'package.json'));
    search.show();
    search.setQuery('dev');
    await new Promise((r) => setTimeout(r, 0));

    search.accept();
    expect(ran).toEqual(['package.json']);
    expect(host.surface.jumps).toEqual([]);
    expect(search.open.value).toBe(false);
  });

  it('Enter по файлу открывает его на найденной строке', async () => {
    const { host, search } = await raise();
    host.surface.hits.push(hit('ts', 'Foo', 'src/foo.ts', 41));
    search.show();
    search.setQuery('Foo');
    await new Promise((r) => setTimeout(r, 0));

    search.accept();
    expect(host.surface.jumps).toMatchObject([{ path: 'src/foo.ts', line: 41 }]);
  });

  it('клавиша, открывшая окно, его и закрывает', async () => {
    const { host, search } = await raise();
    host.run('search.everywhere');
    expect(search.open.value).toBe(true);
    host.run('search.everywhere');
    expect(search.open.value).toBe(false);
  });

  it('стрелки ходят по кругу', async () => {
    const { host, search } = await raise();
    host.surface.hits.push(hit('ts', 'a'), hit('ts', 'b'));
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
