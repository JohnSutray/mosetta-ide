import { describe, expect, it } from 'vitest';
import type { MemoryDoc, MemoryEvent, ProjectMemory } from '@ide/api/server';
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
  constructor(readonly docs: Map<string, string>) {}
  on(listener: (event: MemoryEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  *files(): Iterable<{ path: string }> {
    for (const path of this.docs.keys()) yield { path };
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
  fire(event: MemoryEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function raise(docs: Record<string, string>) {
  const memory = new FakeMemory(new Map(Object.entries(docs)));
  const finds = new FindProviders();
  finds.add(recipes);
  const index = new SearchIndex(memory, () => ({ enabled: true, maxResults: 50 }), silent, finds);
  index.rebuild();
  return { memory, index };
}

describe('поставщики находок', () => {
  it('находки выдуманного сорта ищутся наравне со своими', () => {
    const { index } = raise({ 'dinner.toml': 'borscht\npelmeni\n', 'src/main.ts': 'const a = 1;\n' });
    expect(index.search('recipe::').map((hit) => hit.label).sort()).toEqual(['recipe::borscht', 'recipe::pelmeni']);
  });

  it('сорт становится фильтром, а поиск без него видит всё', () => {
    const { index } = raise({ 'dinner.toml': 'borscht\npelmeni\n' });
    const all = index.search('pelmeni');
    expect(all[0]?.kind).toBe('recipe');
    expect(all[0]?.path).toBe('dinner.toml');
    expect(all[0]?.line).toBe(1);
    expect(all[0]?.detail).toBe('из dinner.toml');
  });

  it('незнакомый сорт — это обычная строка, а не пустой фильтр', () => {
    const { index } = raise({ 'dinner.toml': 'borscht\n' });
    expect(index.search('soup::borscht')).toEqual([]);
  });

  it('сохранённая правка меняет находки, а правка на лету — нет', () => {
    const { memory, index } = raise({ 'dinner.toml': 'borscht\n' });
    memory.docs.set('dinner.toml', 'okroshka\n');
    memory.fire({ type: 'doc.changed', path: 'dinner.toml' });
    expect(index.search('recipe::').map((hit) => hit.label)).toEqual(['recipe::borscht']);
    memory.fire({ type: 'doc.saved', path: 'dinner.toml' });
    expect(index.search('recipe::').map((hit) => hit.label)).toEqual(['recipe::okroshka']);
  });

  it('файл, доехавший в память, попадает к поставщику сам', () => {
    const { memory, index } = raise({ 'src/main.ts': 'const a = 1;\n' });
    expect(index.stats().provided).toBe(0);
    memory.docs.set('lunch.toml', 'soup\n');
    memory.fire({ type: 'doc.resident', path: 'lunch.toml' });
    expect(index.search('recipe::').map((hit) => hit.label)).toEqual(['recipe::soup']);
    expect(index.stats().provided).toBe(1);
  });

  it('файлы ищутся по слипшимся именам', () => {
    const { index } = raise({ 'src/util/helper.ts': '', 'src/main.ts': '' });
    expect(index.search('helper')[0]?.path).toBe('src/util/helper.ts');
    expect(index.search('srmn').map((h) => h.path)).toContain('src/main.ts');
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
