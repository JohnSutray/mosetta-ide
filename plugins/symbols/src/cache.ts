import type { Logger, MemoryEvent, Project, ProjectMemory, ProjectResource } from '@mosetta/ide-api/server';
import { SymbolParser, type ParseAsk } from './parser.js';
import type { SymbolKind } from './ts-symbols.js';

/** What we hand upwards: a hit about a symbol, with no match score yet. */
export interface SymbolHit {
  label: string;
  path: string;
  line: number;
  kind: SymbolKind;
}

const PARSEABLE = /\.(m?ts|cts|tsx|m?js|cjs|jsx)$/i;

/**
 * The project's symbols: a cache per file, with the parsing in a child process.
 *
 * It used to live inside the search index and was a stranger there: the index is about
 * FILES and about what suppliers bring, while knowledge about TypeScript belongs to
 * symbols. With this change the "search everywhere" window became a commons (the
 * `search.source` key), and symbols put theirs in alongside scripts, terminals and
 * whatever comes next.
 *
 * It listens to the same memory the index listened to: a file arrived, was saved,
 * changed from outside — we re-read it; it vanished or moved — we forget it.
 */
export class SymbolCache implements ProjectResource {
  private readonly byFile = new Map<string, SymbolHit[]>();
  private readonly pending = new Set<string>();
  private working: Promise<void> | null = null;
  private disposed = false;
  private readonly off: () => void;
  private readonly parser: SymbolParser;

  constructor(
    project: Project,
    private readonly memory: ProjectMemory,
    private readonly log: Logger,
    dir: string,
    /** The parsing ceiling: a generated tree file is not worth it. */
    private readonly maxBytes: () => number,
    /** A directory outside the walk: the tree promises that nobody goes here. */
    private readonly excluded: (path: string) => boolean,
  ) {
    this.parser = new SymbolParser(project, dir, log);
    this.off = this.memory.on((event: MemoryEvent) => {
      switch (event.type) {
        case 'doc.resident':
        case 'doc.saved':
        case 'doc.external':
          this.enqueue(event.path);
          break;
        case 'doc.removed':
          this.forget(event.path);
          break;
        case 'doc.moved':
          this.forget(event.from);
          this.enqueue(event.path);
          break;
        default:
          break;
      }
    });
  }

  /** Parse everything already in memory. Called when the project opens. */
  warmUp(): Promise<void> {
    for (const file of this.memory.files()) if (this.takes(file.path)) this.pending.add(file.path);
    return this.drain();
  }

  /** How many symbols we know — for the coverage, and for a test. */
  get size(): number {
    let total = 0;
    for (const hits of this.byFile.values()) total += hits.length;
    return total;
  }

  /**
   * Files whose symbols we never got to.
   *
   * We parse only what is resident: the truth for us is the project's memory, and the
   * preload budget limits the symbols' coverage — silently, unless it is said. Those in
   * the queue do not count: they are in progress rather than skipped. Nor does an
   * excluded directory: the user said so themselves, and the tree writes "not indexed"
   * next to it.
   */
  get uncovered(): { absent: number; tooBig: number } {
    let absent = 0;
    let tooBig = 0;
    for (const file of this.memory.files()) {
      if (!PARSEABLE.test(file.path)) continue;
      if (this.excluded(file.path)) continue;
      if (this.byFile.has(file.path) || this.pending.has(file.path)) continue;
      const size = this.memory.docSync(file.path)?.text.length;
      if (size !== undefined && size > this.maxBytes()) tooBig += 1;
      else absent += 1;
    }
    return { absent, tooBig };
  }

  /**
   * Candidates by term and kinds. The score is assigned by SEARCH with its own matcher:
   * here is a cheap subsequence filter, so as not to push thousands of names over the
   * socket.
   *
   * An EMPTY term is a legitimate question: a human typed `ts class ` and is waiting
   * for classes, "whichever come to hand". We hand over the first of the required kind
   * that turn up — the order here is the file order, and we have nothing better: which
   * class matters more will be decided by the window with its own counter.
   */
  find(query: string, limit: number, kinds?: readonly string[]): SymbolHit[] {
    const needle = query.trim().toLowerCase();
    const wanted = kinds && kinds.length > 0 ? new Set(kinds) : null;
    const out: SymbolHit[] = [];
    for (const hits of this.byFile.values()) {
      for (const hit of hits) {
        if (wanted && !wanted.has(hit.kind)) continue;
        if (needle !== '' && !subsequence(needle, hit.label.toLowerCase())) continue;
        out.push(hit);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.off();
    this.parser.dispose();
    await this.working?.catch(() => undefined);
  }

  private takes(path: string): boolean {
    if (!PARSEABLE.test(path)) return false;
    if (this.excluded(path)) return false;
    const size = this.memory.docSync(path)?.text.length;
    return size === undefined || size <= this.maxBytes();
  }

  private forget(path: string): void {
    this.byFile.delete(path);
    this.pending.delete(path);
  }

  private enqueue(path: string): void {
    if (!this.takes(path)) return;
    this.pending.add(path);
    void this.drain();
  }

  private drain(): Promise<void> {
    this.working ??= this.run().finally(() => {
      this.working = null;
    });
    return this.working;
  }

  /**
   * In batches rather than one at a time: bringing TypeScript up in a child costs a
   * quarter of a second, while talking to it costs pennies. A batch also keeps the
   * answer short: the child answers one line per request.
   */
  private async run(): Promise<void> {
    const batchSize = 40;
    while (this.pending.size > 0 && !this.disposed) {
      const batch: ParseAsk[] = [];
      for (const path of [...this.pending].slice(0, batchSize)) {
        this.pending.delete(path);
        const doc = this.memory.docSync(path);
        if (!doc) {
          this.byFile.delete(path);
          continue;
        }
        batch.push({ path, text: doc.text, ext: extensionOf(path) });
      }
      if (batch.length === 0) continue;
      const parsed = await this.parser.parse(batch);
      if (this.disposed) return;
      for (const ask of batch) {
        const found = parsed[ask.path];
        if (!found) continue;
        this.byFile.set(
          ask.path,
          found.map((symbol) => ({ label: symbol.name, path: ask.path, line: symbol.line, kind: symbol.kind })),
        );
      }
    }
    this.log.debug(`symbols: ${this.byFile.size} files, ${this.size} names`);
  }
}

function extensionOf(path: string): string {
  const at = path.lastIndexOf('.');
  return at < 0 ? '' : path.slice(at + 1).toLowerCase();
}

/**
 * A cheap filter: the term's letters come in order. The score is assigned by the search
 * matcher.
 */
function subsequence(needle: string, hay: string): boolean {
  let at = 0;
  for (const letter of needle) {
    at = hay.indexOf(letter, at);
    if (at < 0) return false;
    at += 1;
  }
  return true;
}
