import { describe, expect, it } from 'vitest';
import type { MemoryDoc, MemoryEvent, ProjectMemory } from '@mosetta/ide-api/server';
import { FindProviders } from '../src/finds.js';
import { SearchIndex } from '../src/index.js';
import type { Found } from '../src/types.js';

/** An invented kind: every non-empty line of a `.toml` is a hit. */
const recipes = {
  kind: 'recipe',
  wants: (file: string) => file.endsWith('.toml'),
  finds: (file: string, text: string): Found[] =>
    text
      .split('\n')
      .map((line, at) => ({ line: at, name: line.trim() }))
      .filter((one) => one.name !== '')
      .map((one) => ({ label: one.name, line: one.line, detail: `from ${file}`, id: `${file}#${one.line}` })),
};

/**
 * The project's memory in a test: the files, their texts, and a lever for "an event
 * happened".
 */
class FakeMemory implements ProjectMemory {
  private readonly listeners = new Set<(event: MemoryEvent) => void>();
  /**
   * `ghosts` are files that EXIST in the project but are not in memory: exactly what
   * happens beyond the preload budget. Without them there is nothing to check the
   * index's coverage with — a fake memory was greedy beyond all truth.
   */
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
    if (!doc) throw new Error(`no such doc: ${path}`);
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

function raise(docs: Record<string, string>, ghosts: readonly string[] = []) {
  const memory = new FakeMemory(new Map(Object.entries(docs)), ghosts);
  const finds = new FindProviders();
  finds.add(recipes);
  const index = new SearchIndex(memory, () => ({ enabled: true, maxResults: 50 }), silent, finds);
  index.rebuild();
  return { memory, index };
}

describe('the hit suppliers', () => {
  it('hits of an invented kind are searched on equal terms with our own', () => {
    const { index } = raise({ 'dinner.toml': 'borscht\npelmeni\n', 'src/main.ts': 'const a = 1;\n' });
    expect(index.search('recipe::').hits.map((hit) => hit.label).sort()).toEqual(['recipe::borscht', 'recipe::pelmeni']);
  });

  it('the kind becomes a filter, while a search without it sees everything', () => {
    const { index } = raise({ 'dinner.toml': 'borscht\npelmeni\n' });
    const all = index.search('pelmeni').hits;
    expect(all[0]?.kind).toBe('recipe');
    expect(all[0]?.path).toBe('dinner.toml');
    expect(all[0]?.line).toBe(1);
    expect(all[0]?.detail).toBe('from dinner.toml');
  });

  it('an unfamiliar kind is an ordinary string rather than an empty filter', () => {
    const { index } = raise({ 'dinner.toml': 'borscht\n' });
    expect(index.search('soup::borscht').hits).toEqual([]);
  });

  it('a saved edit changes the hits, an edit in flight does not', () => {
    const { memory, index } = raise({ 'dinner.toml': 'borscht\n' });
    memory.docs.set('dinner.toml', 'okroshka\n');
    memory.fire({ type: 'doc.changed', path: 'dinner.toml' });
    expect(index.search('recipe::').hits.map((hit) => hit.label)).toEqual(['recipe::borscht']);
    memory.fire({ type: 'doc.saved', path: 'dinner.toml' });
    expect(index.search('recipe::').hits.map((hit) => hit.label)).toEqual(['recipe::okroshka']);
  });

  it('a file that arrived in memory reaches the supplier by itself', () => {
    const { memory, index } = raise({ 'src/main.ts': 'const a = 1;\n' });
    expect(index.stats().provided).toBe(0);
    memory.docs.set('lunch.toml', 'soup\n');
    memory.fire({ type: 'doc.resident', path: 'lunch.toml' });
    expect(index.search('recipe::').hits.map((hit) => hit.label)).toEqual(['recipe::soup']);
    expect(index.stats().provided).toBe(1);
  });

  it('files are found by their glued-together names', () => {
    const { index } = raise({ 'src/util/helper.ts': '', 'src/main.ts': '' });
    expect(index.search('helper').hits[0]?.path).toBe('src/util/helper.ts');
    expect(index.search('srmn').hits.map((h) => h.path)).toContain('src/main.ts');
  });
});

/**
 * The truncation has to be VISIBLE. The index used to hand over a bare list, and the
 * window showed its length as the number of hits: fifty out of three hundred looked
 * exactly like all fifty there are.
 */
describe('the index says what it did not show', () => {
  it('the ceiling cuts the list but not the number found', () => {
    const { index } = raise({ 'a1.ts': '', 'a2.ts': '', 'a3.ts': '' });
    const answer = index.search('a', 2);
    expect(answer.hits).toHaveLength(2);
    expect(answer.total).toBe(3);
  });

  it('an empty query finds nothing and does not pretend it found something', () => {
    const { index } = raise({ 'a1.ts': '' });
    expect(index.search('  ')).toEqual({ hits: [], total: 0 });
  });
});

describe('the supplier registry', () => {
  it('two suppliers of one kind is an error rather than a silent replacement', () => {
    const finds = new FindProviders();
    finds.add(recipes);
    expect(() => finds.add({ ...recipes })).toThrow(/recipe/);
  });

  it('it knows which file interests whom', () => {
    const finds = new FindProviders();
    finds.add(recipes);
    expect(finds.wants('dinner.toml')).toBe(true);
    expect(finds.wants('src/main.ts')).toBe(false);
    expect(finds.kinds()).toEqual(['recipe']);
  });
});
