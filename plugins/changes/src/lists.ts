import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_LIST, RESERVED, UNRESOLVED_LIST, type Changelist } from './changelist.js';

export { DEFAULT_LIST, RESERVED, UNRESOLVED_LIST, type Changelist };

interface Stored {
  lists: Changelist[];
}

/**
 * Changelists are a WORKSPACE setting rather than a settings file's.
 *
 * "The list of changelists is a persistent workspace setting of the user's", said the
 * human, and it lives where the shelf lives: in the plugin's state directory, next to
 * the project's key. Not in `settings.json` — that travels with the human from machine
 * to machine, whereas "file X lies in list Y" means something in exactly one working
 * tree. And not in the repository — this is the human's household rather than the
 * project's.
 *
 * Two names are reserved. `changes` is where everything falls by default, and therefore
 * it has NO files written down at all: it is not a list of paths but "everything else".
 * That way it cannot part company with git's truth: a file that has stopped being
 * changed disappears by itself rather than staying as a row in a store. `unresolved` is
 * the conflicts; the panel assigns them there itself from git's state, and nothing is
 * put there by hand.
 */
export class Changelists {
  constructor(
    /** The PLUGIN's state directory: outside the project. */
    private readonly stateDir: () => string,
  ) {}

  /** This project's file of lists — by the same rule as the shelf's directory. */
  fileFor(root: string): string {
    const name = path.basename(root).replace(/[^\w.-]+/g, '_').slice(0, 32) || 'project';
    const hash = createHash('sha1').update(root).digest('hex').slice(0, 12);
    return path.join(this.stateDir(), 'lists', `${name}-${hash}.json`);
  }

  /**
   * What lists there are. The reserved ones are always first and always present: their
   * absence from the file is no reason not to show them.
   */
  async read(root: string): Promise<Changelist[]> {
    let stored: Stored | null = null;
    try {
      stored = JSON.parse(await fs.readFile(this.fileFor(root), 'utf8')) as Stored;
    } catch {
      stored = null;
    }
    const own = Array.isArray(stored?.lists) ? stored.lists.filter((one) => this.sane(one)) : [];
    const rest = own.filter((one) => !RESERVED.includes(one.id));
    return [
      { id: DEFAULT_LIST, name: DEFAULT_LIST, files: [] },
      { id: UNRESOLVED_LIST, name: UNRESOLVED_LIST, files: [] },
      ...rest.map((one) => ({ id: one.id, name: one.name, files: [...new Set(one.files)] })),
    ];
  }

  /**
   * Write it down. We do not write the reserved ones: they are there always, file or no
   * file.
   */
  async write(root: string, lists: Changelist[]): Promise<void> {
    const file = this.fileFor(root);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const own = lists.filter((one) => !RESERVED.includes(one.id));
    await fs.writeFile(file, JSON.stringify({ lists: own }, null, 2), 'utf8');
  }

  /**
   * Set up a list. The name is the human's, the id is our own, so that renaming does
   * not touch it.
   */
  async create(root: string, name: string): Promise<Changelist> {
    const lists = await this.read(root);
    const made: Changelist = { id: this.idFor(name, lists), name, files: [] };
    await this.write(root, [...lists, made]);
    return made;
  }

  async rename(root: string, id: string, name: string): Promise<void> {
    if (RESERVED.includes(id)) throw new Error(`list ${id} cannot be renamed`);
    const lists = await this.read(root);
    await this.write(root, lists.map((one) => (one.id === id ? { ...one, name } : one)));
  }

  /**
   * Remove a list. Its files go back to `changes` — that is, they simply stop being
   * counted anywhere.
   */
  async remove(root: string, id: string): Promise<void> {
    if (RESERVED.includes(id)) throw new Error(`list ${id} cannot be removed`);
    const lists = await this.read(root);
    await this.write(root, lists.filter((one) => one.id !== id));
  }

  /**
   * Move files into a list. They leave their previous ones — a file lies in exactly one
   * place, or "how many files are in the list" stops being a question with one answer.
   */
  async move(root: string, id: string, files: string[]): Promise<void> {
    const lists = await this.read(root);
    if (!lists.some((one) => one.id === id)) throw new Error(`no such list: ${id}`);
    const moved = lists.map((one) => ({
      ...one,
      files: one.files.filter((file) => !files.includes(file)),
    }));
    if (!RESERVED.includes(id)) {
      const to = moved.find((one) => one.id === id)!;
      to.files = [...new Set([...to.files, ...files])];
    }
    await this.write(root, moved);
  }

  private sane(one: unknown): one is Changelist {
    const list = one as Partial<Changelist> | null;
    return (
      typeof list?.id === 'string' &&
      typeof list.name === 'string' &&
      Array.isArray(list.files) &&
      list.files.every((file) => typeof file === 'string')
    );
  }

  /**
   * An id out of the name plus a tail: two lists with one name are a legitimate state.
   * Any letters, not only Latin ones: `\w` in JS is ASCII, and it turned "моя ветка"
   * into "list" — that is, into a name with no name in it.
   */
  private idFor(name: string, lists: Changelist[]): string {
    const base = name.toLowerCase().replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'list';
    let id = base;
    let n = 2;
    while (lists.some((one) => one.id === id) || RESERVED.includes(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    return id;
  }
}
