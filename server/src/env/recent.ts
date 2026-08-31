import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RecentProject } from '@ide/protocol';

const LIMIT = 12;

const caches = new Map<string, RecentProject[]>();

function fileIn(stateDir: string): string {
  return path.join(stateDir, 'recent.json');
}

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
  readonly defaultStateDir = path.join(os.homedir(), '.web-ide');

  async list(stateDir: string): Promise<RecentProject[]> {
    const known = caches.get(stateDir);
    if (known) return known;
    let list: RecentProject[] = [];
    try {
      const raw = await fs.readFile(fileIn(stateDir), 'utf8');
      const parsed = JSON.parse(raw) as RecentProject[];
      list = Array.isArray(parsed) ? parsed.filter(valid).slice(0, LIMIT) : [];
    } catch {
      list = [];
    }
    const alive = await Promise.all(list.map((item) => exists(item.root)));
    list = list.filter((_, at) => alive[at]);
    caches.set(stateDir, list);
    return list;
  }

  async remember(
    stateDir: string,
    root: string,
    name: string,
  ): Promise<RecentProject[]> {
    const list = await this.list(stateDir);
    const next = [
      { root, name, openedAt: Date.now() },
      ...list.filter((item) => item.root !== root),
    ].slice(0, LIMIT);
    caches.set(stateDir, next);
    try {
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(fileIn(stateDir), JSON.stringify(next, null, 2), 'utf8');
    } catch {}
    return next;
  }
}

export const recent = new Recent();
