import { describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '@mosetta/ide-plugin-doc';
import SearchPlugin, { type IndexHit } from '../src/client.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * "Search everywhere" as a plugin: what it promises.
 *
 * The hits go in sections by kind, and the sections' order is set by the best result in
 * each. Enter on a script RUNS it rather than opening package.json: the kind's owner is
 * taken from our own `search.opener` key.
 */
function hit(kind: string, label: string, path = `${label}.ts`, line?: number): IndexHit {
  return { kind, label, path, line, matches: [], score: 1 };
}

const NAME = '@mosetta/ide-plugin-search';

/** Wait for the commons: the sources are asked after the typing pause. */
const later = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));

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

describe('search everywhere', () => {
  it('the hits gather into sections, and the first result stays first', async () => {
    const { search, hits } = await raise();
    hits.push(hit('ts', 'one'), hit('file', 'two'), hit('ts', 'three'), hit('file', 'four'));
    search.show();
    search.setQuery('o');
    await new Promise((r) => setTimeout(r, 0));

    const rows = search.rows.value.map((row) => ('header' in row ? `# ${row.header}` : row.hit.label));
    expect(rows).toEqual(['# search.kind.ts', 'one', 'three', '# search.kind.file', 'two', 'four']);
  });

  it('the window knows it did not show everything', async () => {
    const { search, hits, answers } = await raise();
    hits.push(hit('file', 'one'));
    answers.set('search', () => ({ hits, total: 42 }));
    search.show();
    search.setQuery('o');
    await new Promise((r) => setTimeout(r, 0));

    expect(search.hits.value).toHaveLength(1);
    expect(search.total.value).toBe(42);
  });

  it('Enter on a script hands the hit to the kind\'s owner rather than opening a file', async () => {
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

  it('Enter on a file opens it at the line that was found', async () => {
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

  it('the key that opened the window closes it', async () => {
    const { host, search } = await raise();
    host.run('search.everywhere');
    expect(search.open.value).toBe(true);
    host.run('search.everywhere');
    expect(search.open.value).toBe(false);
  });

  it('an empty field is taken by recent places from a supplier', async () => {
    const { host, search } = await raise();
    host.registry.add(
      'search.source',
      {
        id: 'recent-files',
        kind: 'recent',
        find: ({ term }: { term: string }) =>
          term === '' ? [{ ...hit('recent', 'src/a.ts', 'src/a.ts', 4), score: 0 }, { ...hit('recent', 'src/b.ts', 'src/b.ts'), score: 0 }] : [],
      },
      '@mosetta/ide-plugin-visits',
    );
    search.show();
    await later();
    const rows = search.rows.value.map((row) => ('header' in row ? `# ${row.header}` : row.hit.label));
    expect(rows).toEqual(['# search.kind.recent', 'src/a.ts', 'src/b.ts']);
    expect(search.hits.value.every((one) => one.matches.length === 0)).toBe(true);
    expect(search.hits.value[0]?.line).toBe(4);
  });

  it('no supplier means an empty field stays empty, and that is not a breakage', async () => {
    const { search } = await raise();
    search.show();
    await new Promise((r) => setTimeout(r, 0));
    expect(search.hits.value).toEqual([]);
  });

  it('on an empty term a source is asked for exactly as many as the setting says', async () => {
    const { host, search } = await raise();
    const asked: number[] = [];
    host.registry.add(
      'search.source',
      {
        id: 'recent-files',
        kind: 'recent',
        find: ({ limit }: { limit: number }) => {
          asked.push(limit);
          return Array.from({ length: 40 }, (_, i) => ({ ...hit('recent', `f${i}.ts`), score: 0 }));
        },
      },
      '@mosetta/ide-plugin-visits',
    );
    search.show();
    await later();
    expect(asked[0]).toBe(15);
    expect(search.hits.value).toHaveLength(15);
  });

  it('the arrows walk in a circle', async () => {
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

/**
 * The commons: the window takes hits from anybody.
 *
 * The user's rule: "search everywhere" stays a MARKETPLACE. A source puts its own into
 * the `search.source` key and is entitled to go outwards — to the server, into a child
 * process — so it is asked AFTER the typing pause rather than on every letter.
 */
describe('the commons', () => {
  it('a source\'s hits stand in the results next to our own', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('file', 'doc', 'doc.ts'));
    host.registry.add(
      'search.source',
      { id: 'sym', kind: 'ts', find: () => [{ ...hit('ts', 'ts::Symbol'), score: 9 }] },
      '@mosetta/ide-plugin-symbols',
    );
    search.show();
    search.setQuery('s');
    await later();
    expect(search.hits.value.map((one) => one.label)).toContain('ts::Symbol');
  });

  it('a late answer does not move what is selected', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('file', 'doc', 'doc.ts'));
    host.registry.add(
      'search.source',
      { id: 'sym', kind: 'ts', find: () => [{ ...hit('ts', 'ts::Sooner'), score: 99 }] },
      '@mosetta/ide-plugin-symbols',
    );
    search.show();
    search.setQuery('d');
    await new Promise((r) => setTimeout(r, 0));
    const chosen = search.current.value?.label;
    await later();
    expect(search.current.value?.label, 'the same is under the caret as was before').toBe(chosen);
  });

  it('a chip is created from the declared kind and switches the source off', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('file', 'doc', 'doc.ts'));
    let asked = 0;
    host.registry.add(
      'search.source',
      {
        id: 'sym',
        kind: 'ts',
        find: () => {
          asked += 1;
          return [{ ...hit('ts', 'ts::Symbol'), score: 9 }];
        },
      },
      '@mosetta/ide-plugin-symbols',
    );
    search.show();
    search.setQuery('s');
    await later();
    expect(search.kinds.value, 'the chip exists').toContain('ts');
    expect(asked, 'it was asked').toBeGreaterThan(0);
    const before = asked;

    search.toggleKind('ts');
    await later();
    expect(asked, 'the disabled one was not asked').toBe(before);
    expect(search.hits.value.some((one) => one.kind === 'ts')).toBe(false);
    expect(search.kinds.value).toContain('ts');
  });

  it('recents create their own chip and are switched off by it', async () => {
    const { host, search } = await raise();
    host.registry.add(
      'search.source',
      {
        id: 'recent-files',
        kind: 'recent',
        find: ({ term }: { term: string }) => (term === '' ? [{ ...hit('recent', 'src/a.ts'), score: 0 }] : []),
      },
      '@mosetta/ide-plugin-visits',
    );
    search.show();
    await later();
    expect(search.kinds.value).toContain('recent');

    search.toggleKind('recent');
    await later();
    expect(search.hits.value).toEqual([]);
    expect(search.kinds.value, 'the chip stays, otherwise there is nothing to bring it back with').toContain('recent');
  });

  it('a collapsed section hides its rows but not itself or its count', async () => {
    const { search, hits } = await raise();
    hits.push(hit('ts', 'one'), hit('ts', 'two'), hit('file', 'three'));
    search.show();
    search.setQuery('o');
    await later();

    search.toggleSection('ts');
    const rows = search.rows.value.map((row) => ('header' in row ? `# ${row.header} ${row.count}` : row.hit.label));
    expect(rows).toEqual(['# search.kind.ts 2', '# search.kind.file 1', 'three']);
    expect(search.isFolded('ts')).toBe(true);
    expect(search.current.value?.label).toBe('three');

    search.move(1);
    expect(search.current.value?.label).toBe('three');

    search.toggleSection('ts');
    expect(search.rows.value.filter((row) => !('header' in row))).toHaveLength(3);
  });

  it('the kind\'s icon is drawn by whoever brought the kind', async () => {
    const { host, search, hits } = await raise();
    host.registry.add(
      'search.icon',
      { kind: 'npm', icon: () => 'a script icon' },
      '@mosetta/ide-plugin-npm-scripts',
    );
    hits.push(hit('npm', 'dev', 'package.json'), hit('file', 'foo', 'src/foo.ts'));
    search.show();
    search.setQuery('o');
    await later();

    expect(search.iconFor(hits[0]!)).toBe('a script icon');
    expect(search.iconFor(hits[1]!)).toBeNull();
  });

  it('a tag narrows the results and does not disturb other sources', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('file', 'layout.ts', 'src/layout.ts'));
    let askedTerminals = 0;
    host.registry.add(
      'search.source',
      {
        id: 'sym',
        kind: 'ts',
        tags: () => ['function', 'class'],
        find: () => [
          { ...hit('ts', 'fit', 'src/fit.ts'), tags: ['function'], score: 9 },
          { ...hit('ts', 'Fitter', 'src/fit.ts'), tags: ['class'], score: 8 },
        ],
      },
      '@mosetta/ide-plugin-symbols',
    );
    host.registry.add(
      'search.source',
      {
        id: 'terminals',
        kind: 'terminal',
        find: () => {
          askedTerminals += 1;
          return [];
        },
      },
      '@mosetta/ide-plugin-terminal',
    );

    search.show();
    await later();
    const before = askedTerminals;

    search.setQuery('ts function fit');
    await later();

    expect(search.hits.value.map((one) => one.label)).toEqual(['fit']);
    expect(askedTerminals, 'the other source was not asked').toBe(before);
  });

  it('a tag nobody promises is named out loud', async () => {
    const { host, search } = await raise();
    host.registry.add(
      'search.source',
      { id: 'sym', kind: 'ts', tags: () => ['function'], find: () => [] },
      '@mosetta/ide-plugin-symbols',
    );
    search.show();
    search.setQuery('ts function fit');
    await later();
    expect(search.strayTags.value, 'everything is familiar — we stay silent').toEqual([]);

    search.setQuery('fnction fit');
    await later();
    expect(search.strayTags.value).toEqual(['fnction']);
  });

  it('a tag with an empty term asks a source for a list rather than for silence', async () => {
    const { host, search } = await raise();
    const asks: Array<{ term: string; tags: string[]; limit: number }> = [];
    host.registry.add(
      'search.source',
      {
        id: 'sym',
        kind: 'ts',
        tags: () => ['class'],
        find: (ask: { term: string; tags: string[]; limit: number }) => {
          asks.push(ask);
          return ask.term === ''
            ? [hit('ts', 'Alpha'), hit('ts', 'Beta')].map((one) => ({ ...one, tags: ['class'], score: 0 }))
            : [];
        },
      },
      '@mosetta/ide-plugin-symbols',
    );

    search.show();
    search.setQuery('ts class ');
    await later();

    expect(asks.at(-1)).toMatchObject({ term: '', tags: ['ts', 'class'] });
    expect(search.hits.value.map((one) => one.label)).toEqual(['Alpha', 'Beta']);
    expect(asks.at(-1)?.limit).toBe(60);
  });

  it('on a bare tag what turned up more often before comes first', async () => {
    const { host, search } = await raise();
    const all = [hit('ts', 'Alpha'), hit('ts', 'Beta'), hit('ts', 'Gamma')];
    host.registry.add(
      'search.source',
      {
        id: 'sym',
        kind: 'ts',
        tags: () => ['class'],
        find: ({ term }: { term: string }) =>
          term === ''
            ? all.map((one) => ({ ...one, tags: ['class'], score: 0 }))
            : [{ ...hit('ts', 'Gamma'), tags: ['class'], score: 5 }],
      },
      '@mosetta/ide-plugin-symbols',
    );

    search.show();
    search.setQuery('gam');
    await later();
    search.accept();

    search.show();
    search.setQuery('ts class ');
    await later();
    expect(search.hits.value.map((one) => one.label)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('a list handed over for a bare tag does not confirm itself', async () => {
    const { host, search } = await raise();
    host.registry.add(
      'search.source',
      {
        id: 'sym',
        kind: 'ts',
        tags: () => ['class'],
        find: ({ term }: { term: string }) =>
          term === '' ? [{ ...hit('ts', 'Alpha'), tags: ['class'], score: 0 }] : [],
      },
      '@mosetta/ide-plugin-symbols',
    );
    search.show();
    search.setQuery('ts class ');
    await later();
    expect(search.recall.countOf({ ...hit('ts', 'Alpha'), tags: ['class'] })).toBe(0);
  });

  it('a source that folded the query finds things from capital letters too', async () => {
    const { host, plugin, search } = await raise();
    host.registry.add(
      'search.source',
      {
        id: 'sym',
        kind: 'ts',
        find: ({ term, limit }: { term: string; limit: number }) => {
          const folded = plugin.textIndex.fold(term);
          return [{ label: 'ThemePlugin', path: 'plugins/theme/src/client.tsx' }]
            .map((one) => {
              const scored = plugin.matcher.match(plugin.textIndex.of(one.label), folded);
              return scored
                ? { kind: 'ts', label: one.label, path: one.path, score: scored.score, matches: scored.positions }
                : null;
            })
            .filter((one): one is NonNullable<typeof one> => one !== null)
            .slice(0, limit);
        },
      },
      '@mosetta/ide-plugin-symbols',
    );

    search.show();
    search.setQuery('ThemePlugin');
    await later();
    expect(search.hits.value.map((one) => one.label)).toEqual(['ThemePlugin']);
  });

  it('a tag\'s short name is expanded before the source is asked', async () => {
    const { host, search } = await raise();
    const asks: string[][] = [];
    host.registry.add(
      'search.source',
      {
        id: 'sym',
        kind: 'ts',
        tags: () => [{ name: 'class', short: 'c' }, { name: 'function', short: 'fn' }],
        find: (ask: { term: string; tags: string[] }) => {
          asks.push(ask.tags);
          return ask.term === '' ? [{ ...hit('ts', 'Alpha'), tags: ['class'], score: 0 }] : [];
        },
      },
      '@mosetta/ide-plugin-symbols',
    );

    search.show();
    search.setQuery('c ');
    await later();

    expect(asks.at(-1)).toEqual(['class']);
    expect(search.hits.value.map((one) => one.label)).toEqual(['Alpha']);
    expect(search.strayTags.value).toEqual([]);
  });

  it('a source\'s note is visible only when it was asked and did not answer', async () => {
    const { host, search } = await raise();
    host.registry.add(
      'search.source',
      {
        id: 'sym',
        kind: 'ts',
        find: ({ term }: { term: string }) => (term === 'present' ? [{ ...hit('ts', 'Found it'), score: 3 }] : []),
        note: () => ({ key: 'symbols.partial', params: { count: 3 } }),
      },
      '@mosetta/ide-plugin-symbols',
    );

    search.show();
    await later();
    expect(search.notes.value, 'we stay silent until we are asked').toEqual([]);

    search.setQuery('present');
    await later();
    expect(search.notes.value, 'it found something — nobody asks about its holes').toEqual([]);

    search.setQuery('absent');
    await later();
    expect(search.notes.value).toEqual([{ key: 'symbols.partial', params: { count: 3 } }]);
  });

  it('a source breaking does not bring the results down', async () => {
    const { host, search, hits } = await raise();
    hits.push(hit('file', 'doc', 'doc.ts'));
    host.registry.add(
      'search.source',
      { id: 'corrupt', kind: 'x', find: () => Promise.reject(new Error('it fell over')) },
      '@mosetta/ide-plugin-somebody',
    );
    search.show();
    search.setQuery('d');
    await later();
    expect(search.hits.value.map((one) => one.label)).toEqual(['doc']);
  });

  it('a source speaks about its own coverage itself', async () => {
    const { host, search } = await raise();
    host.registry.add(
      'search.source',
      { id: 'sym', kind: 'ts', find: () => [], note: () => ({ key: 'symbols.partial', params: { count: 7 } }) },
      '@mosetta/ide-plugin-symbols',
    );
    search.show();
    search.setQuery('anything at all');
    await later();
    expect(search.notes.value).toEqual([{ key: 'symbols.partial', params: { count: 7 } }]);
  });
});
