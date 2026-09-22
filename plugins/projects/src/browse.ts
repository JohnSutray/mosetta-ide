import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DirSuggestion } from './types.js';

/**
 * How many of the tree's directories look inside themselves at once. The limit here is
 * about COST (that many readdir calls while showing) rather than about the length of
 * the list: the list itself is not cut at all.
 */
const PREFETCH = 24;

/** "Do not limit" — for the tree, where cutting is not allowed. */
const ALL = Number.POSITIVE_INFINITY;

/**
 * If what was typed is an existing directory in its entirety, we show ITS contents
 * rather than neighbours with similar names. That is how a shell behaves, and that is
 * how it reads: "I am standing here, show me what is here". Not a directory means the
 * last piece stays a filter.
 */
async function resolve(at: { dir: string; partial: string }): Promise<{ dir: string; partial: string }> {
  if (at.partial === '') return at;
  const full = path.join(at.dir, at.partial);
  try {
    if ((await fs.stat(full)).isDirectory()) return { dir: full, partial: '' };
  } catch {}
  return at;
}

/**
 * Split what was typed into "where to look" and "what has been typed already". A path
 * ending in a separator is a directory in its entirety — the user has already gone
 * inside.
 */
function split(value: string): { dir: string; partial: string } {
  if (value.endsWith('/') || value.endsWith(path.sep)) {
    return { dir: value, partial: '' };
  }
  const dir = path.dirname(value);
  const partial = path.basename(value);
  return { dir: dir === '' ? path.sep : dir, partial };
}

/**
 * Walking the MACHINE's directories for the project picker: there may be no project at
 * that moment.
 */
export class Browse {
  /**
   * The roots of the picker's tree: the home directory and the drive root.
   *
   * The home directory arrives with two levels at once — it is what people poke at in
   * ninety cases out of a hundred, and waiting for each level to expand by a separate
   * request there is pointless. The drive root comes with one level: people go there
   * rarely and deliberately.
   */
  async roots(): Promise<DirSuggestion[]> {
    const home = os.homedir();
    const [homeKids, diskKids] = await Promise.all([
      this.suggestDirectories(`${home}${path.sep}`, ALL, 2),
      this.suggestDirectories(path.sep, ALL, 1),
    ]);
    return [
      { path: home, name: '~', children: homeKids },
      { path: path.sep, name: path.sep, children: diskKids },
    ];
  }

  /**
   * By default we do NOT CUT.
   *
   * The default used to be twenty-four, and that was enough to lose directories twice:
   * first in the tree's root, then when expanding a directory by click — where the
   * default was in force. The rule is simple: a full answer is the norm, and truncation
   * is asked for explicitly.
   */
  async suggestDirectories(prefix: string, limit = ALL, depth = 1): Promise<DirSuggestion[]> {
    const raw = this.expandHome(prefix.trim());
    const { dir, partial } = await resolve(split(raw === '' ? `${os.homedir()}${path.sep}` : raw));

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
    const page = Number.isFinite(limit) ? out.slice(0, limit) : out;

    if (depth > 1) {
      await Promise.all(
        page.slice(0, PREFETCH).map(async (item) => {
          item.children = await this.suggestDirectories(`${item.path}${path.sep}`, limit, depth - 1);
        }),
      );
    }
    return page;
  }

  /** `~/code` → `/Users/john/code`. The tilde is expanded only at the start. */
  expandHome(value: string): string {
    if (value === '~') return os.homedir();
    if (value.startsWith('~/') || value.startsWith('~\\')) {
      return path.join(os.homedir(), value.slice(2));
    }
    return value;
  }
}
