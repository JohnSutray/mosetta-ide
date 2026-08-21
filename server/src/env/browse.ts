import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DirSuggestion } from '@ide/protocol';

const LIMIT = 24;

export async function browseRoots(): Promise<DirSuggestion[]> {
  const home = os.homedir();
  const [homeKids, diskKids] = await Promise.all([
    suggestDirectories(`${home}${path.sep}`, LIMIT, 2),
    suggestDirectories(path.sep, LIMIT, 1),
  ]);
  return [
    { path: home, name: '~', children: homeKids },
    { path: path.sep, name: path.sep, children: diskKids },
  ];
}

export async function suggestDirectories(
  prefix: string,
  limit = LIMIT,
  depth = 1,
): Promise<DirSuggestion[]> {
  const raw = expandHome(prefix.trim());
  const { dir, partial } = await resolve(
    split(raw === '' ? `${os.homedir()}${path.sep}` : raw),
  );

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const needle = partial.toLowerCase();
  const out: DirSuggestion[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith('.') && !partial.startsWith('.')) continue;
    if (needle !== '' && !entry.name.toLowerCase().startsWith(needle)) continue;
    out.push({ path: path.join(dir, entry.name), name: entry.name });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
  const page = out.slice(0, limit);

  if (depth > 1) {
    await Promise.all(
      page.map(async (item) => {
        item.children = await suggestDirectories(`${item.path}${path.sep}`, limit, depth - 1);
      }),
    );
  }
  return page;
}

export function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

async function resolve(at: { dir: string; partial: string }): Promise<{ dir: string; partial: string }> {
  if (at.partial === '') return at;
  const full = path.join(at.dir, at.partial);
  try {
    if ((await fs.stat(full)).isDirectory()) return { dir: full, partial: '' };
  } catch {}
  return at;
}

function split(value: string): { dir: string; partial: string } {
  if (value.endsWith('/') || value.endsWith(path.sep)) {
    return { dir: value, partial: '' };
  }
  const dir = path.dirname(value);
  const partial = path.basename(value);
  return { dir: dir === '' ? path.sep : dir, partial };
}
