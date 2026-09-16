import type { IndexSettings } from './settings.js';

type IndexPart = Pick<IndexSettings, 'enabled' | 'maxResults' | 'symbolsMaxKb'>;
import type { Logger, ProjectMemory } from '@mosetta/ide-api/server';
import { matcher } from './matcher.js';
import { layout } from './layout.js';
import { Vocabulary, textIndex, type Indexed } from './text.js';
import type { FindProviders } from './finds.js';
import { tsSymbols, type SymbolKind } from './ts-symbols.js';
import { OWN_KINDS, type IndexHit, type IndexKind, type SearchAnswer, type SearchStats } from './types.js';

function extensionOf(key: string): string {
  const name = key.slice(key.lastIndexOf('/') + 1);
  const at = name.lastIndexOf('.');
  return at <= 0 ? '' : name.slice(at + 1).toLowerCase();
}

interface Entry {
  kind: IndexKind;
  label: string;
  path: string;
  line?: number;
  detail?: string;
  detailKey?: string;
  id?: string;
  indexed: Indexed;
}

const KIND_PREFIX = /^([\w-]+)::(.*)$/s;

function symbolKey(kind: SymbolKind): string {
  return `search.symbol.${kind}`;
}

export class SearchIndex {
  private files: Entry[] = [];
  private provided: Entry[] = [];
  private readonly symbols = new Map<string, Entry[]>();
  private vocabulary = new Vocabulary();

  private staleTree = true;
  private readonly pending = new Set<string>();
  private working: Promise<void> | null = null;
  private disposed = false;
  private readonly off: () => void;

  constructor(
    private readonly ram: ProjectMemory,
    private readonly settingsOf: () => IndexPart,
    private readonly log: Logger,
    private readonly providers: FindProviders,
    private readonly excluded: (path: string) => boolean = () => false,
  ) {
    this.off = ram.on((event) => {
      switch (event.type) {
        case 'tree.changed':
          this.staleTree = true;
          break;
        case 'doc.resident':
        case 'doc.saved':
        case 'doc.external':
          this.enqueue(event.path);
          break;
        case 'doc.removed':
          this.symbols.delete(event.path);
          this.pending.delete(event.path);
          this.staleTree = true;
          break;
        case 'doc.moved':
          this.symbols.delete(event.from);
          this.pending.delete(event.from);
          this.staleTree = true;
          this.enqueue(event.path);
          break;
        default:
          break;
      }
    });
  }

  private get settings(): IndexPart {
    return this.settingsOf();
  }

  dispose(): void {
    this.disposed = true;
    this.off();
    this.files = [];
    this.provided = [];
    this.symbols.clear();
    this.pending.clear();
  }

  rebuild(): void {
    const started = Date.now();
    const paths: string[] = [];
    const files: Entry[] = [];

    for (const file of this.ram.files()) {
      paths.push(file.path);
    }

    this.vocabulary = new Vocabulary();
    for (const path of paths) this.vocabulary.learn(path);
    for (const entries of this.symbols.values()) {
      for (const entry of entries) this.vocabulary.learn(entry.label);
    }

    for (const path of paths) {
      files.push({
        kind: 'file',
        label: path,
        path,
        detail: parentOf(path) || undefined,
        indexed: textIndex.of(path, this.vocabulary),
      });
    }
    this.files = files;
    this.rebuildProvided();
    this.staleTree = false;

    this.log.debug(
      `индекс: ${this.files.length} файлов, ${this.provided.length} находок поставщиков, ` +
        `${this.symbolCount} символов, словарь ${this.vocabulary.size} слов ` +
        `(${Date.now() - started} мс)`,
    );
  }

  private rebuildProvided(): void {
    const provided: Entry[] = [];
    const unseen: string[] = [];
    for (const provider of this.providers.all()) {
      for (const file of this.ram.files()) {
        if (!provider.wants(file.path)) continue;
        const doc = this.ram.docSync(file.path);
        if (!doc) {
          if (!this.ram.isTextual(file.path)) unseen.push(file.path);
          continue;
        }
        let found;
        try {
          found = provider.finds(file.path, doc.text);
        } catch (err) {
          this.log.warn(`поставщик ${provider.kind} на ${file.path}: ${String(err)}`);
          continue;
        }
        for (const one of found) {
          const label = `${provider.kind}::${one.label}`;
          provided.push({
            kind: provider.kind,
            label,
            path: one.path ?? file.path,
            ...(one.line !== undefined ? { line: one.line } : {}),
            ...(one.detail ? { detail: one.detail } : {}),
            ...(one.id ? { id: one.id } : {}),
            indexed: textIndex.of(label, this.vocabulary),
          });
        }
      }
    }
    if (unseen.length > 0) {
      this.log.warn(
        `поставщики находок ждут ${unseen.length} файлов, которые память не считает ` +
          `текстовыми (${unseen.slice(0, 3).join(', ')}): они двоичные`,
      );
    }
    this.provided = provided;
  }

  byKind(kind: string): IndexHit[] {
    if (this.staleTree) this.rebuild();
    return this.provided
      .filter((entry) => entry.kind === kind)
      .map((entry) => toHit(entry, 0, []))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  oneOf(kind: string, id: string): IndexHit | undefined {
    if (this.staleTree) this.rebuild();
    const found = this.provided.find((entry) => entry.kind === kind && entry.id === id);
    return found ? toHit(found, 0, []) : undefined;
  }

  private enqueue(path: string): void {
    if (!this.settings.enabled) return;
    if (this.providers.wants(path)) this.staleTree = true;
    if (!this.parseable(path)) return;
    this.pending.add(path);
    this.schedule();
  }

  private parseable(path: string): boolean {
    if (!tsSymbols.canParse(extensionOf(path))) return false;
    if (this.excluded(path)) return false;
    const size = this.ram.docSync(path)?.text.length;
    return size === undefined || size <= this.settings.symbolsMaxKb * 1024;
  }

  indexSymbols(): Promise<void> {
    if (!this.settings.enabled) return Promise.resolve();
    for (const file of this.ram.files()) {
      if (this.parseable(file.path) && this.ram.docSync(file.path)) {
        this.pending.add(file.path);
      }
    }
    return this.schedule();
  }

  private schedule(): Promise<void> {
    this.working ??= this.drain().finally(() => {
      this.working = null;
    });
    return this.working;
  }

  private async drain(): Promise<void> {
    if (this.pending.size === 0) return;
    const api = await tsSymbols.load();
    let done = 0;

    while (this.pending.size > 0 && !this.disposed) {
      const path = this.pending.values().next().value as string;
      this.pending.delete(path);
      const doc = this.ram.docSync(path);
      if (!doc) {
        this.symbols.delete(path);
        continue;
      }
      try {
        const found = tsSymbols.parse(api, path, doc.text, extensionOf(path));
        this.symbols.set(
          path,
          found.map((symbol) => {
            const label = `ts::${symbol.name}`;
            return {
              kind: 'ts' as const,
              label,
              path,
              line: symbol.line,
              detailKey: symbolKey(symbol.kind),
              detail: path,
              indexed: textIndex.of(label, this.vocabulary),
            };
          }),
        );
      } catch (err) {
        this.symbols.delete(path);
        this.log.debug(`символы ${path}: ${String(err)}`);
      }

      done += 1;
      if (done % 40 === 0) await new Promise((resolve) => setImmediate(resolve));
    }
  }

  search(query: string, limit = this.settings.maxResults, kinds?: IndexKind[]): SearchAnswer {
    if (this.staleTree) this.rebuild();

    const raw = query.trim();
    if (raw === '') return { hits: [], total: 0 };

    const prefixed = KIND_PREFIX.exec(raw);
    const kindFilter = new Set(kinds ?? []);
    let term = raw;
    if (prefixed && this.knows(prefixed[1]!)) {
      kindFilter.clear();
      kindFilter.add(prefixed[1]!);
      term = prefixed[2]!;
    }

    const folded = textIndex.fold(term);
    const other = folded === '' ? null : layout.retype(folded);
    const hits: IndexHit[] = [];

    for (const entry of this.everything()) {
      if (kindFilter.size > 0 && !kindFilter.has(entry.kind)) continue;
      if (folded === '') {
        hits.push(toHit(entry, 0, []));
        continue;
      }
      let found = matcher.match(entry.indexed, folded);
      if (other !== null) {
        const alt = matcher.match(entry.indexed, other);
        if (alt && (!found || alt.score > found.score)) found = alt;
      }
      if (!found) continue;
      hits.push(toHit(entry, found.score, found.positions));
    }

    hits.sort(
      (a, b) =>
        b.score - a.score ||
        a.label.length - b.label.length ||
        a.label.localeCompare(b.label, 'ru'),
    );
    return { hits: hits.slice(0, limit), total: hits.length };
  }

  private knows(kind: string): boolean {
    const own: readonly string[] = OWN_KINDS;
    return own.includes(kind) || this.providers.kinds().includes(kind);
  }

  private *everything(): Generator<Entry> {
    yield* this.provided;
    for (const entries of this.symbols.values()) yield* entries;
    yield* this.files;
  }

  private get symbolCount(): number {
    let total = 0;
    for (const entries of this.symbols.values()) total += entries.length;
    return total;
  }

  private get unparsedCount(): number {
    let total = 0;
    for (const file of this.ram.files()) {
      if (!tsSymbols.canParse(extensionOf(file.path))) continue;
      if (this.excluded(file.path)) continue;
      if (this.symbols.has(file.path) || this.pending.has(file.path)) continue;
      total += 1;
    }
    return total;
  }

  stats(): SearchStats {
    if (this.staleTree) this.rebuild();
    return {
      files: this.files.length,
      provided: this.provided.length,
      symbols: this.symbolCount,
      vocabulary: this.vocabulary.size,
      pending: this.pending.size,
      unparsed: this.unparsedCount,
    };
  }
}

function toHit(entry: Entry, score: number, matches: number[]): IndexHit {
  return {
    kind: entry.kind,
    label: entry.label,
    path: entry.path,
    ...(entry.line !== undefined ? { line: entry.line } : {}),
    ...(entry.detail ? { detail: entry.detail } : {}),
    ...(entry.detailKey ? { detailKey: entry.detailKey } : {}),
    ...(entry.id ? { id: entry.id } : {}),
    score,
    matches,
  };
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}
