import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** What lies on the shelf: a patch with a name, a date and a list of files. */
export interface ShelfItem {
  /**
   * The patch file's name without the extension — the key as well:
   * `2026-09-16T21-04-11-1a2b`.
   */
  id: string;
  /** What the human called it. By default, the first line of the commit message. */
  name: string;
  /** When it was put aside, ISO. Shown next to the name. */
  at: string;
  /** The paths the patch touches. Needed to work out where it will land. */
  files: string[];
}

interface ShelfMeta {
  name: string;
  at: string;
  files: string[];
}

/**
 * The shelf is patches OUTSIDE git.
 *
 * It differs from `git stash` not in convenience but in where it lives: a stash lies in
 * the repository and travels with it, while the shelf lies in the plugin's state
 * directory and belongs to the HUMAN. So it is not visible to another clone and is not
 * lost along with a branch; and so too it does not stop `git stash` existing beside it
 * — these are different things rather than two ways of doing one.
 *
 * The patch is an ordinary `git diff`, and that is a choice: it will be applied by the
 * same `git apply`, that is, by git's mechanics rather than by ours. The file next to
 * the patch is its passport (the name, the date, the list of paths): reading a `diff`
 * for the sake of a name would mean parsing a format we are not obliged to understand.
 *
 * An entry lives until it is thrown away BY HAND: applying a patch is a reading rather
 * than a moving. That is the second difference from a stash, and it is also what makes
 * the shelf a library of drafts: one and the same thing can be applied to several
 * branches, tried out and rolled back.
 */
export class Shelf {
  constructor(
    /** The PLUGIN's state directory: outside the project. */
    private readonly stateDir: () => string,
  ) {}

  /**
   * This project's shelf directory. A readable name plus a hash of the path — as with
   * the history of visits: two `web-ide` directories in different places must not share
   * a shelf.
   */
  dirFor(root: string): string {
    const name = path.basename(root).replace(/[^\w.-]+/g, '_').slice(0, 32) || 'project';
    const hash = createHash('sha1').update(root).digest('hex').slice(0, 12);
    return path.join(this.stateDir(), 'shelf', `${name}-${hash}`);
  }

  /**
   * What is on the shelf, freshest first. Broken entries are passed over in silence —
   * without losing the rest.
   */
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

  /**
   * Put a patch onto the shelf. We do not put an empty patch: an empty entry is a
   * deception.
   */
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

  /** The patch's text. No file — no entry either: we say so rather than keep quiet. */
  async patchOf(root: string, id: string): Promise<string> {
    return fs.readFile(path.join(this.dirFor(root), `${safe(id)}.patch`), 'utf8');
  }

  /** Rename an entry: the passport is edited, the patch is left alone. */
  async rename(root: string, id: string, name: string): Promise<void> {
    const dir = this.dirFor(root);
    const meta = await this.metaOf(dir, safe(id));
    if (!meta) throw new Error(`no such shelf item: ${id}`);
    await fs.writeFile(path.join(dir, `${safe(id)}.json`), JSON.stringify({ ...meta, name }, null, 2), 'utf8');
  }

  /** Take it off the shelf for good. The patch and the passport go together. */
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

/**
 * An entry's name comes from the client, and we make a path out of it — which means we
 * check it. A `..` or a slash would turn "take it off the shelf" into the reading of
 * any file on the machine.
 */
function safe(id: string): string {
  if (!/^[\w.-]+$/.test(id) || id.includes('..')) throw new Error(`bad shelf id: ${id}`);
  return id;
}
