import { describe, expect, it } from 'vitest';
import type { MemoryDoc, MemoryEvent, ProjectMemory } from '@mosetta/ide-api/server';
import { FindProviders } from '../src/finds.js';
import { SearchIndex } from '../src/index.js';
import type { Found } from '../src/types.js';

const recipes = {
  kind: 'recipe',
  wants: (file: string) => file.endsWith('.toml'),
  finds: (file: string, text: string): Found[] =>
    text
      .split('\n')
      .map((line, at) => ({ line: at, name: line.trim() }))
      .filter((one) => one.name !== '')
      .map((one) => ({ label: one.name, line: one.line, detail: `из ${file}`, id: `${file}#${one.line}` })),
};

class FakeMemory implements ProjectMemory {
  private readonly listeners = new Set<(event: MemoryEvent) => void>();
  constructor(readonly docs: Map<string, string>, private readonly ghosts: readonly string[] = []) {}
  on(listener: (event: MemoryEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  *files(): Iterable<{ path: string }> {
    for (const path of this.docs.keys()) yield { path };
    for (const path of this.ghosts) yield { path };
  }
  docSync(path: string): MemoryDoc | null {
    const text = this.docs.get(path);
    return text === undefined ? null : { path, text, version: 1, openCount: 0 };
  }
  async peekDoc(path: string): Promise<MemoryDoc> {
    const doc = this.docSync(path);
    if (!doc) throw new Error(`нет ${path}`);
    return doc;
  }
  isTextual(path: string): boolean {
    return /\.(toml|ts|md)$/.test(path);
  }
  async disk(): Promise<null> {
    return null;
  }
  async settle(): Promise<void> {}
  async adopt(): Promise<void> {}
  fire(event: MemoryEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function raise(
  docs: Record<string, string>,
  ghosts: readonly string[] = [],
  extra: { symbolsMaxKb?: number; excluded?: (path: string) => boolean } = {},
) {
  const memory = new FakeMemory(new Map(Object.entries(docs)), ghosts);
  const finds = new FindProviders();
  finds.add(recipes);
  const index = new SearchIndex(
    memory,
    () => ({ enabled: true, maxResults: 50, symbolsMaxKb: extra.symbolsMaxKb ?? 512 }),
    silent,
    finds,
    extra.excluded ?? (() => false),
  );
  index.rebuild();
  return { memory, index };
}

describe('поставщики находок', () => {
  it('находки выдуманного сорта ищутся наравне со своими', () => {
    const { index } = raise({ 'dinner.toml': 'borscht\npelmeni\n', 'src/main.ts': 'const a = 1;\n' });
    expect(index.search('recipe::').hits.map((hit) => hit.label).sort()).toEqual(['recipe::borscht', 'recipe::pelmeni']);
  });

  it('сорт становится фильтром, а поиск без него видит всё', () => {
    const { index } = raise({ 'dinner.toml': 'borscht\npelmeni\n' });
    const all = index.search('pelmeni').hits;
    expect(all[0]?.kind).toBe('recipe');
    expect(all[0]?.path).toBe('dinner.toml');
    expect(all[0]?.line).toBe(1);
    expect(all[0]?.detail).toBe('из dinner.toml');
  });

  it('незнакомый сорт — это обычная строка, а не пустой фильтр', () => {
    const { index } = raise({ 'dinner.toml': 'borscht\n' });
    expect(index.search('soup::borscht').hits).toEqual([]);
  });

  it('сохранённая правка меняет находки, а правка на лету — нет', () => {
    const { memory, index } = raise({ 'dinner.toml': 'borscht\n' });
    memory.docs.set('dinner.toml', 'okroshka\n');
    memory.fire({ type: 'doc.changed', path: 'dinner.toml' });
    expect(index.search('recipe::').hits.map((hit) => hit.label)).toEqual(['recipe::borscht']);
    memory.fire({ type: 'doc.saved', path: 'dinner.toml' });
    expect(index.search('recipe::').hits.map((hit) => hit.label)).toEqual(['recipe::okroshka']);
  });

  it('файл, доехавший в память, попадает к поставщику сам', () => {
    const { memory, index } = raise({ 'src/main.ts': 'const a = 1;\n' });
    expect(index.stats().provided).toBe(0);
    memory.docs.set('lunch.toml', 'soup\n');
    memory.fire({ type: 'doc.resident', path: 'lunch.toml' });
    expect(index.search('recipe::').hits.map((hit) => hit.label)).toEqual(['recipe::soup']);
    expect(index.stats().provided).toBe(1);
  });

  it('файлы ищутся по слипшимся именам', () => {
    const { index } = raise({ 'src/util/helper.ts': '', 'src/main.ts': '' });
    expect(index.search('helper').hits[0]?.path).toBe('src/util/helper.ts');
    expect(index.search('srmn').hits.map((h) => h.path)).toContain('src/main.ts');
  });
});

describe('индекс говорит, чего он не показал', () => {
  it('потолок режет список, но не число найденного', () => {
    const { index } = raise({ 'a1.ts': '', 'a2.ts': '', 'a3.ts': '' });
    const answer = index.search('a', 2);
    expect(answer.hits).toHaveLength(2);
    expect(answer.total).toBe(3);
  });

  it('пустой запрос ничего не находит и не делает вид, что нашёл', () => {
    const { index } = raise({ 'a1.ts': '' });
    expect(index.search('  ')).toEqual({ hits: [], total: 0 });
  });

  it('файл вне памяти объявлен непокрытым, а разобранный — нет', async () => {
    const { index } = raise({ 'src/main.ts': 'export function hello() {}\n' }, ['src/cold.ts']);
    await index.indexSymbols();
    const stats = index.stats();
    expect(stats.symbols).toBe(1);
    expect(stats.unparsed).toBe(1);
  });

  it('файл без символов — это не непокрытый файл', async () => {
    const { index } = raise({ 'src/empty.ts': '\n' });
    await index.indexSymbols();
    expect(index.stats().unparsed).toBe(0);
  });
});

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

describe('чего индекс не разбирает', () => {
  const big = `export const x = 1;\n${'// '.repeat(40_000)}\n`;

  it('папка вне обхода не разбирается вовсе', async () => {
    const { index } = raise(
      { 'src/main.ts': 'export function alive() {}\n', 'dist/bundle.ts': 'export function hidden() {}\n' },
      [],
      { excluded: (path) => path.startsWith('dist/') },
    );
    await index.indexSymbols();
    expect(index.search('ts::alive').hits).toHaveLength(1);
    expect(index.search('ts::hidden').hits, 'из исключённой папки символов нет').toHaveLength(0);
    expect(index.stats().unparsed).toBe(0);
  });

  it('файл больше потолка пропускается, и это видно в покрытии', async () => {
    const { index } = raise({ 'src/main.ts': 'export function alive() {}\n', 'src/bundle.ts': big }, [], { symbolsMaxKb: 1 });
    await index.indexSymbols();
    expect(index.search('ts::alive').hits).toHaveLength(1);
    expect(index.search('ts::x').hits, 'большой файл не разобран').toHaveLength(0);
    expect(index.stats().unparsed).toBeGreaterThan(0);
  });

  it('потолок поднимается настройкой', async () => {
    const { index } = raise({ 'src/bundle.ts': big }, [], { symbolsMaxKb: 4096 });
    await index.indexSymbols();
    expect(index.search('ts::x').hits).toHaveLength(1);
  });
});
