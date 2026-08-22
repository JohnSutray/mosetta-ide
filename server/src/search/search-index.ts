import type { IndexHit, IndexKind, IndexSettings, SearchStats } from '@ide/protocol';
import type { Logger } from '../log.js';
import { baseName, extensionOf } from '../workspace/paths.js';
import type { RamFs } from '../fs/ram-fs.js';
import { match } from './matcher.js';
import { retype } from './layout.js';
import { fold, indexString, Vocabulary, type Indexed } from './text.js';
import { parseScripts, type NpmScript } from './npm-scripts.js';
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

const KIND_PREFIX = /^(ts|npm|file)::(.*)$/s;

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
  private scripts: Entry[] = [];
  private rawScripts: NpmScript[] = [];
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
    this.scripts = [];
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
    this.rebuildScripts();
    this.staleTree = false;

    this.log.debug(
      `индекс: ${this.files.length} файлов, ${this.scripts.length} скриптов, ` +
        `${this.symbolCount} символов, словарь ${this.vocabulary.size} слов ` +
        `(${Date.now() - started} мс)`,
    );
  }

  private rebuildScripts(): void {
    const scripts: Entry[] = [];
    const raw: NpmScript[] = [];
    for (const file of this.ram.files()) {
      if (baseName(file.path) !== 'package.json') continue;
      const doc = this.ram.docSync(file.path);
      if (!doc) continue;
      for (const script of parseScripts(file.path, doc.text)) {
        raw.push(script);
        const label = `npm::${script.id}`;
        scripts.push({
          kind: 'npm',
          label,
          path: script.path,
          detail: script.command,
          id: script.id,
          indexed: indexString(label, this.vocabulary),
        });
      }
    }
    this.scripts = scripts;
    this.rawScripts = raw;
  }

  listScripts(): NpmScript[] {
    if (this.staleTree) this.rebuild();
    return [...this.rawScripts].sort(
      (a, b) => a.packageName.localeCompare(b.packageName) || a.script.localeCompare(b.script),
    );
  }

  findScript(id: string): NpmScript | undefined {
    if (this.staleTree) this.rebuild();
    return this.rawScripts.find((script) => script.id === id);
  }

  private enqueue(path: string): void {
    if (!this.settings.enabled) return;
    if (baseName(path) === 'package.json') this.staleTree = true;
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
    if (prefixed) {
      kindFilter.clear();
      kindFilter.add(prefixed[1] as IndexKind);
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

  private *everything(): Generator<Entry> {
    yield* this.scripts;
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
      scripts: this.scripts.length,
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
