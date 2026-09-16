import type { Logger, MemoryEvent, Project, ProjectMemory, ProjectResource } from '@mosetta/ide-api/server';
import { SymbolParser, type ParseAsk } from './parser.js';
import type { SymbolKind } from './ts-symbols.js';

export interface SymbolHit {
  label: string;
  path: string;
  line: number;
  kind: SymbolKind;
}

const PARSEABLE = /\.(m?ts|cts|tsx|m?js|cjs|jsx)$/i;

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
    private readonly maxBytes: () => number,
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

  warmUp(): Promise<void> {
    for (const file of this.memory.files()) if (this.takes(file.path)) this.pending.add(file.path);
    return this.drain();
  }

  get size(): number {
    let total = 0;
    for (const hits of this.byFile.values()) total += hits.length;
    return total;
  }

  get uncovered(): number {
    let total = 0;
    for (const file of this.memory.files()) {
      if (!PARSEABLE.test(file.path)) continue;
      if (this.excluded(file.path)) continue;
      if (this.byFile.has(file.path) || this.pending.has(file.path)) continue;
      total += 1;
    }
    return total;
  }

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
    this.log.debug(`символы: ${this.byFile.size} файлов, ${this.size} имён`);
  }
}

function extensionOf(path: string): string {
  const at = path.lastIndexOf('.');
  return at < 0 ? '' : path.slice(at + 1).toLowerCase();
}

function subsequence(needle: string, hay: string): boolean {
  let at = 0;
  for (const letter of needle) {
    at = hay.indexOf(letter, at);
    if (at < 0) return false;
    at += 1;
  }
  return true;
}
