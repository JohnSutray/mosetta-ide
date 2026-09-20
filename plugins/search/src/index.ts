import type { IndexSettings } from './settings.js';

/** What the server half reads from the `index` section. */
type IndexPart = Pick<IndexSettings, 'enabled' | 'maxResults'>;
import type { Logger, ProjectMemory } from '@mosetta/ide-api/server';
import { matcher } from './matcher.js';
import { layout } from './layout.js';
import { Vocabulary, textIndex, type Indexed } from './text.js';
import type { FindProviders } from './finds.js';
import { OWN_KINDS, type IndexHit, type IndexKind, type SearchAnswer, type SearchStats } from './types.js';

/**
 * The derived layer — what a double Shift searches.
 *
 * Entries of one list but different kinds. The index has two of its own — files and
 * TypeScript symbols; everything else is brought by SUPPLIERS, and `npm::` is one of
 * them, arriving with the scripts plugin. The kind is part of the string itself, so
 * filtering by kind needs no separate mechanism: it falls out of an ordinary search.
 *
 * A derived layer in the full sense: the only source is BORROWED memory, and there is
 * no disk here. The index can be thrown away and rebuilt with nothing lost. Symbols are
 * parsed only for the files that lie in memory — so the preload budget automatically
 * limits us too. It used to live in the core, because only core code could stand on
 * memory.
 */

interface Entry {
  kind: IndexKind;
  label: string;
  path: string;
  line?: number;
  detail?: string;
  /** An action's identifier: for scripts their id, which is also the terminal's name. */
  id?: string;
  indexed: Indexed;
}

const KIND_PREFIX = /^([\w-]+)::(.*)$/s;

export class SearchIndex {
  private files: Entry[] = [];
  /** Everything the suppliers gave: the kind is kept in the entry itself. */
  private provided: Entry[] = [];
  private vocabulary = new Vocabulary();

  private staleTree = true;
  private readonly off: () => void;

  constructor(
    private readonly ram: ProjectMemory,
    private readonly settingsOf: () => IndexPart,
    private readonly log: Logger,
    /**
     * Who can find what. It arrives through the constructor rather than from a module:
     * the registry has an owner, and a test is free to assemble its own.
     */
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

  /** Files and the suppliers' hits: cheap, it is a walk over what has already been read. */
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
      `index: ${this.files.length} files, ${this.provided.length} supplier hits, ` +
        `vocabulary ${this.vocabulary.size} words ` +
        `(${Date.now() - started} ms)`,
    );
  }

  /**
   * Ask the suppliers. WE bring them the text: they have no reading of their own, and
   * that is not a limitation but a layer — the truth here is memory.
   */
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
          this.log.warn(`supplier ${provider.kind} on ${file.path}: ${String(err)}`);
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
        `the hit suppliers are waiting for ${unseen.length} files memory does not consider ` +
          `textual (${unseen.slice(0, 3).join(', ')}): they are binary`,
      );
    }
    this.provided = provided;
  }

  /**
   * Every hit of one kind — as a list rather than a search. This is what listing the
   * scripts used to be, except the index no longer knows whose they are.
   */
  byKind(kind: string): IndexHit[] {
    if (this.staleTree) this.rebuild();
    return this.provided
      .filter((entry) => entry.kind === kind)
      .map((entry) => toHit(entry, 0, []))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** One hit by its id — what finding a script used to be. */
  oneOf(kind: string, id: string): IndexHit | undefined {
    if (this.staleTree) this.rebuild();
    const found = this.provided.find((entry) => entry.kind === kind && entry.id === id);
    return found ? toHit(found, 0, []) : undefined;
  }

  /**
   * A synchronous search over memory: a double Shift has no right to wait for disk or
   * for a process.
   */
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

  /**
   * Whether such a kind exists. An unfamiliar one is not a filter but an ordinary
   * string.
   */
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
