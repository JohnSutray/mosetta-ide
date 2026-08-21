import type { IndexHit, IndexSettings } from '@ide/protocol';
import type { Logger } from '../log.js';
import { baseName } from '../workspace/paths.js';
import type { RamFs } from '../fs/ram-fs.js';

interface Entry {
  path: string;
  name: string;
  lowerPath: string;
  lowerName: string;
}

function fold(value: string): string {
  return value.normalize('NFC').toLowerCase();
}

export class FileIndex {
  private entries: Entry[] = [];
  private dirtyList = true;
  private readonly off: () => void;

  constructor(
    private readonly ram: RamFs,
    private settings: IndexSettings,
    private readonly log: Logger,
  ) {
    this.off = ram.on((event) => {
      if (event.type === 'tree.changed' || event.type === 'doc.resident') {
        this.dirtyList = true;
      }
    });
  }

  applySettings(settings: IndexSettings): void {
    this.settings = settings;
  }

  dispose(): void {
    this.off();
    this.entries = [];
  }

  rebuild(): void {
    const started = Date.now();
    const entries: Entry[] = [];
    for (const file of this.ram.files()) {
      const name = baseName(file.path);
      entries.push({
        path: file.path,
        name,
        lowerPath: fold(file.path),
        lowerName: fold(name),
      });
    }
    this.entries = entries;
    this.dirtyList = false;
    this.log.debug(`индекс имён: ${entries.length} файлов за ${Date.now() - started} мс`);
  }

  search(query: string, limit = this.settings.maxResults): IndexHit[] {
    if (this.dirtyList) this.rebuild();
    const needle = fold(query.trim());
    if (needle === '') return [];

    const hits: IndexHit[] = [];
    for (const entry of this.entries) {
      const inName = fuzzy(entry.lowerName, needle);
      if (inName) {
        const offset = entry.path.length - entry.name.length;
        hits.push({
          path: entry.path,
          name: entry.name,
          score: inName.score,
          matches: inName.matches.map((i) => i + offset),
        });
        continue;
      }
      const inPath = fuzzy(entry.lowerPath, needle);
      if (inPath) {
        hits.push({
          path: entry.path,
          name: entry.name,
          score: inPath.score + 1000,
          matches: inPath.matches,
        });
      }
    }

    hits.sort((a, b) => a.score - b.score || a.path.length - b.path.length);
    return hits.slice(0, limit);
  }

  get size(): number {
    if (this.dirtyList) this.rebuild();
    return this.entries.length;
  }
}

function fuzzy(haystack: string, needle: string): { score: number; matches: number[] } | null {
  const matches: number[] = [];
  let score = 0;
  let at = 0;

  for (let n = 0; n < needle.length; n += 1) {
    const found = haystack.indexOf(needle[n]!, at);
    if (found === -1) return null;
    if (n > 0) {
      const gap = found - matches[matches.length - 1]! - 1;
      score += gap === 0 ? 0 : gap + 1;
    } else {
      score += found;
    }
    const before = haystack[found - 1];
    if (found === 0 || before === '/' || before === '.' || before === '-' || before === '_') {
      score = Math.max(0, score - 2);
    }
    matches.push(found);
    at = found + 1;
  }
  return { score, matches };
}
