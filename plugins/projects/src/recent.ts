import fs from 'node:fs/promises';
import path from 'node:path';
import type { RecentProject } from './types.js';

/** More than a dozen rows and a human is no longer choosing by eye. */
const LIMIT = 12;

async function exists(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

function valid(item: unknown): item is RecentProject {
  const value = item as RecentProject;
  return (
    !!value &&
    typeof value.root === 'string' &&
    typeof value.name === 'string' &&
    typeof value.openedAt === 'number'
  );
}

export class Recent {
  private cache: RecentProject[] | null = null;

  /** Where to write — as a parameter: a test has a directory of its own. */
  constructor(private readonly stateDir: string) {}

  private get file(): string {
    return path.join(this.stateDir, 'recent.json');
  }

  async list(): Promise<RecentProject[]> {
    if (this.cache) return this.cache;
    let list: RecentProject[] = [];
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as RecentProject[];
      list = Array.isArray(parsed) ? parsed.filter(valid).slice(0, LIMIT) : [];
    } catch {
      list = [];
    }
    const alive = await Promise.all(list.map((item) => exists(item.root)));
    list = list.filter((_, at) => alive[at]);
    this.cache = list;
    return list;
  }

  /** Remember an opened project. It also becomes first in the list. */
  async remember(root: string, name: string): Promise<RecentProject[]> {
    const list = await this.list();
    const next = [{ root, name, openedAt: Date.now() }, ...list.filter((item) => item.root !== root)].slice(
      0,
      LIMIT,
    );
    this.cache = next;
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
      await fs.writeFile(this.file, JSON.stringify(next, null, 2), 'utf8');
    } catch {}
    return next;
  }
}
