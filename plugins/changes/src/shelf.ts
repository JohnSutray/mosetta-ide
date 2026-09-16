import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ShelfItem {
  id: string;
  name: string;
  at: string;
  files: string[];
}

interface ShelfMeta {
  name: string;
  at: string;
  files: string[];
}

export class Shelf {
  constructor(
    private readonly stateDir: () => string,
  ) {}

  dirFor(root: string): string {
    const name = path.basename(root).replace(/[^\w.-]+/g, '_').slice(0, 32) || 'project';
    const hash = createHash('sha1').update(root).digest('hex').slice(0, 12);
    return path.join(this.stateDir(), 'shelf', `${name}-${hash}`);
  }

  async list(root: string): Promise<ShelfItem[]> {
    const dir = this.dirFor(root);
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out: ShelfItem[] = [];
    for (const file of names) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -'.json'.length);
      const meta = await this.metaOf(dir, id);
      if (meta) out.push({ id, ...meta });
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  async put(root: string, name: string, patch: string, files: string[]): Promise<ShelfItem | null> {
    if (patch.trim() === '') return null;
    const dir = this.dirFor(root);
    await fs.mkdir(dir, { recursive: true });
    const at = new Date().toISOString();
    const id = `${at.replace(/[:.]/g, '-')}-${createHash('sha1').update(patch).digest('hex').slice(0, 6)}`;
    await fs.writeFile(path.join(dir, `${id}.patch`), patch, 'utf8');
    const meta: ShelfMeta = { name: name.trim() || files[0] || 'shelf', at, files };
    await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(meta, null, 2), 'utf8');
    return { id, ...meta };
  }

  async patchOf(root: string, id: string): Promise<string> {
    return fs.readFile(path.join(this.dirFor(root), `${safe(id)}.patch`), 'utf8');
  }

  async drop(root: string, id: string): Promise<void> {
    const dir = this.dirFor(root);
    await fs.rm(path.join(dir, `${safe(id)}.patch`), { force: true });
    await fs.rm(path.join(dir, `${safe(id)}.json`), { force: true });
  }

  private async metaOf(dir: string, id: string): Promise<ShelfMeta | null> {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8')) as Partial<ShelfMeta>;
      if (typeof raw.name !== 'string' || typeof raw.at !== 'string') return null;
      return { name: raw.name, at: raw.at, files: Array.isArray(raw.files) ? raw.files.filter(isText) : [] };
    } catch {
      return null;
    }
  }
}

function isText(one: unknown): one is string {
  return typeof one === 'string';
}

function safe(id: string): string {
  if (!/^[\w.-]+$/.test(id) || id.includes('..')) throw new Error(`bad shelf id: ${id}`);
  return id;
}
