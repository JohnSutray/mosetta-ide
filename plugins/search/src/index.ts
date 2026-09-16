import type { IndexSettings } from './settings.js';

type IndexPart = Pick<IndexSettings, 'enabled' | 'maxResults'>;
import type { Logger, ProjectMemory } from '@mosetta/ide-api/server';
import { matcher } from './matcher.js';
import { layout } from './layout.js';
import { Vocabulary, textIndex, type Indexed } from './text.js';
import type { FindProviders } from './finds.js';
import { OWN_KINDS, type IndexHit, type IndexKind, type SearchAnswer, type SearchStats } from './types.js';

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

export class SearchIndex {
  private files: Entry[] = [];
  private provided: Entry[] = [];
  private vocabulary = new Vocabulary();

  private staleTree = true;
  private readonly off: () => void;

  constructor(
    private readonly ram: ProjectMemory,
    private readonly settingsOf: () => IndexPart,
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
          if (this.providers.wants(event.path)) this.staleTree = true;
          break;
        case 'doc.removed':
          this.staleTree = true;
          break;
        case 'doc.moved':
          this.staleTree = true;
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
    this.off();
    this.files = [];
    this.provided = [];
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
        `словарь ${this.vocabulary.size} слов ` +
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
    yield* this.files;
  }

  stats(): SearchStats {
    if (this.staleTree) this.rebuild();
    return {
      files: this.files.length,
      provided: this.provided.length,
      symbols: 0,
      vocabulary: this.vocabulary.size,
      pending: 0,
      unparsed: 0,
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
