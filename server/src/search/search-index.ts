import {
  CORE_KINDS,
  type IndexHit,
  type IndexKind,
  type IndexSettings,
  type SearchStats,
} from '@ide/protocol';
import type { Logger } from '../log.js';
import { extensionOf } from '../workspace/paths.js';
import type { RamFs } from '../fs/ram-fs.js';
import { match } from './matcher.js';
import { retype } from './layout.js';
import { fold, indexString, Vocabulary, type Indexed } from './text.js';
import type { FindProviders } from './providers.js';
import { canParse, loadTypeScript, parseSymbols, type SymbolKind } from './ts-symbols.js';

interface Entry {
  kind: IndexKind;
  label: string;
  path: string;
  line?: number;
  detail?: string;
  id?: string;
  indexed: Indexed;
}

const KIND_PREFIX = /^([\w-]+)::(.*)$/s;

const SYMBOL_DETAIL: Record<SymbolKind, string> = {
  function: 'функция',
  class: 'класс',
  method: 'метод',
  property: 'поле',
  interface: 'интерфейс',
  type: 'тип',
  enum: 'енум',
  'enum-member': 'значение енума',
  variable: 'переменная',
};

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
    private readonly ram: RamFs,
    private settings: IndexSettings,
    private readonly log: Logger,
    private readonly providers: FindProviders,
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

  applySettings(settings: IndexSettings): void {
    this.settings = settings;
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
        indexed: indexString(path, this.vocabulary),
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
            indexed: indexString(label, this.vocabulary),
          });
        }
      }
    }
    if (unseen.length > 0) {
      this.log.warn(
        `поставщики находок ждут ${unseen.length} файлов, которые память не считает ` +
          `текстовыми (${unseen.slice(0, 3).join(', ')}): добавь расширение в fs.textExtensions`,
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
    if (!canParse(extensionOf(path))) return;
    this.pending.add(path);
    this.schedule();
  }

  indexSymbols(): Promise<void> {
    if (!this.settings.enabled) return Promise.resolve();
    for (const file of this.ram.files()) {
      if (canParse(extensionOf(file.path)) && this.ram.docSync(file.path)) {
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
    const api = await loadTypeScript();
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
        const found = parseSymbols(api, path, doc.text, extensionOf(path));
        this.symbols.set(
          path,
          found.map((symbol) => {
            const label = `ts::${symbol.name}`;
            return {
              kind: 'ts' as const,
              label,
              path,
              line: symbol.line,
              detail: `${SYMBOL_DETAIL[symbol.kind]} · ${path}`,
              indexed: indexString(label, this.vocabulary),
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

  search(query: string, limit = this.settings.maxResults, kinds?: IndexKind[]): IndexHit[] {
    if (this.staleTree) this.rebuild();

    const raw = query.trim();
    if (raw === '') return [];

    const prefixed = KIND_PREFIX.exec(raw);
    const kindFilter = new Set(kinds ?? []);
    let term = raw;
    if (prefixed && this.knows(prefixed[1]!)) {
      kindFilter.clear();
      kindFilter.add(prefixed[1]!);
      term = prefixed[2]!;
    }

    const folded = fold(term);
    const other = folded === '' ? null : retype(folded);
    const hits: IndexHit[] = [];

    for (const entry of this.everything()) {
      if (kindFilter.size > 0 && !kindFilter.has(entry.kind)) continue;
      if (folded === '') {
        hits.push(toHit(entry, 0, []));
        continue;
      }
      let found = match(entry.indexed, folded);
      if (other !== null) {
        const alt = match(entry.indexed, other);
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
    return hits.slice(0, limit);
  }

  private knows(kind: string): boolean {
    const core: readonly string[] = CORE_KINDS;
    return core.includes(kind) || this.providers.kinds().includes(kind);
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

  stats(): SearchStats {
    if (this.staleTree) this.rebuild();
    return {
      files: this.files.length,
      provided: this.provided.length,
      symbols: this.symbolCount,
      vocabulary: this.vocabulary.size,
      pending: this.pending.size,
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
    ...(entry.id ? { id: entry.id } : {}),
    score,
    matches,
  };
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}
