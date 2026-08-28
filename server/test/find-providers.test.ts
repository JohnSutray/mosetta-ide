import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Found } from '../src/search/providers.js';
import { FindProviders } from '../src/search/providers.js';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

const recipes = {
  kind: 'recipe',
  wants: (file: string) => file.endsWith('.toml'),
  finds: (file: string, text: string): Found[] =>
    text
      .split('\n')
      .map((line, at) => ({ line: at, name: line.trim() }))
      .filter((one) => one.name !== '')
      .map((one) => ({
        label: one.name,
        line: one.line,
        detail: `из ${file}`,
        id: `${file}#${one.line}`,
      })),
};

describe('поставщики находок', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await withServer(60_000, undefined, [recipes]);
    root = await makeProject('finds', {
      'dinner.toml': 'borscht\npelmeni\n',
      'src/main.ts': 'const a = 1;\n',
    });
    c = await connect(server);
    await c.call('workspace.open', { root });
    await waitForFinds(c);
  });

  afterEach(async () => {
    await c?.close();
    await server?.close();
    await removeProject(root);
  });

  it('находки выдуманного сорта ищутся наравне со своими', async () => {
    const hits = await c.call('index.search', { query: 'recipe::' });
    expect(hits.map((hit) => hit.label).sort()).toEqual(['recipe::borscht', 'recipe::pelmeni']);
  });

  it('сорт становится фильтром, а поиск без него видит всё', async () => {
    const all = await c.call('index.search', { query: 'pelmeni' });
    expect(all[0]?.kind).toBe('recipe');
    expect(all[0]?.path).toBe('dinner.toml');
    expect(all[0]?.line).toBe(1);
    expect(all[0]?.detail).toBe('из dinner.toml');
  });

  it('незнакомый сорт — это обычная строка, а не пустой фильтр', async () => {
    const hits = await c.call('index.search', { query: 'soup::borscht' });
    expect(hits).toEqual([]);
  });

  it('сохранённая правка меняет находки', async () => {
    const opened = await c.call('doc.open', { path: 'dinner.toml' });
    await c.call('doc.edit', {
      path: 'dinner.toml',
      text: 'okroshka\n',
      baseVersion: opened.version,
    });
    await c.call('doc.save', { path: 'dinner.toml' });
    const hits = await c.call('index.search', { query: 'recipe::' });
    expect(hits.map((hit) => hit.label)).toEqual(['recipe::okroshka']);
  });

  it('счётчик находок в статистике общий, а не про скрипты', async () => {
    const stats = await c.call('index.stats', null);
    expect(stats.provided).toBe(2);
  });
});

async function waitForFinds(client: TestClient): Promise<void> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const stats = await client.call('index.stats', null);
    if (stats.provided > 0) return;
    if (Date.now() > deadline) throw new Error('поставщик так и не дал находок');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('реестр поставщиков', () => {
  it('два поставщика одного сорта — это ошибка, а не молчаливая замена', () => {
    const finds = new FindProviders();
    finds.add(recipes);
    expect(() => finds.add({ ...recipes })).toThrow(/recipe/);
  });

  it('знает, кому какой файл интересен', () => {
    const finds = new FindProviders();
    finds.add(recipes);
    expect(finds.wants('dinner.toml')).toBe(true);
    expect(finds.wants('src/main.ts')).toBe(false);
    expect(finds.kinds()).toEqual(['recipe']);
  });
});
