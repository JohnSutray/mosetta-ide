import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DirSuggestion } from '@ide/protocol';

const LIMIT = 24;

export async function suggestDirectories(prefix: string, limit = LIMIT): Promise<DirSuggestion[]> {
  const raw = expandHome(prefix.trim());
  const { dir, partial } = split(raw === '' ? `${os.homedir()}${path.sep}` : raw);

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
  return out.slice(0, limit);
}

export function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function split(value: string): { dir: string; partial: string } {
  if (value.endsWith('/') || value.endsWith(path.sep)) {
    return { dir: value, partial: '' };
  }
  const dir = path.dirname(value);
  const partial = path.basename(value);
  return { dir: dir === '' ? path.sep : dir, partial };
}
