import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_LIST, RESERVED, UNRESOLVED_LIST, type Changelist } from './changelist.js';

export { DEFAULT_LIST, RESERVED, UNRESOLVED_LIST, type Changelist };

interface Stored {
  lists: Changelist[];
}

export class Changelists {
  constructor(
    private readonly stateDir: () => string,
  ) {}

  fileFor(root: string): string {
    const name = path.basename(root).replace(/[^\w.-]+/g, '_').slice(0, 32) || 'project';
    const hash = createHash('sha1').update(root).digest('hex').slice(0, 12);
    return path.join(this.stateDir(), 'lists', `${name}-${hash}.json`);
  }

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

  async write(root: string, lists: Changelist[]): Promise<void> {
    const file = this.fileFor(root);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const own = lists.filter((one) => !RESERVED.includes(one.id));
    await fs.writeFile(file, JSON.stringify({ lists: own }, null, 2), 'utf8');
  }

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

  async remove(root: string, id: string): Promise<void> {
    if (RESERVED.includes(id)) throw new Error(`list ${id} cannot be removed`);
    const lists = await this.read(root);
    await this.write(root, lists.filter((one) => one.id !== id));
  }

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
