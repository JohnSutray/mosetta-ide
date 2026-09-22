import type { DirEntry, DocState, DocVersion } from '@mosetta/ide-protocol';
import type { MemoryDoc, MemoryEvent, ProjectMemory } from '@mosetta/ide-api/server';

interface Doc {
  text: string;
  saved: string;
  version: number;
  revision: number;
}

/**
 * The demo's disk and memory in one: a map of paths to texts, with the saved copy kept
 * beside the edited one so that "unsaved" means the same thing it means on a real
 * daemon. It also plays the `ProjectMemory` that the real search index and grep are
 * written against, which is why those two run here unchanged.
 */
export class DemoFiles implements ProjectMemory {
  private readonly docs = new Map<string, Doc>();
  private readonly dirs = new Set<string>(['']);
  private readonly listeners = new Set<(event: MemoryEvent) => void>();
  /** What "disk" holds for a file that changed behind the editor's back. */
  private readonly behind = new Map<string, string>();
  private readonly started = Date.now();

  constructor(files: Record<string, string>) {
    for (const [path, text] of Object.entries(files)) this.put(path, text);
  }

  private put(path: string, text: string): void {
    this.docs.set(path, { text, saved: text, version: 1, revision: 1 });
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join('/'));
  }

  private emit(event: MemoryEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  has(path: string): boolean {
    return this.docs.has(path);
  }

  isDir(path: string): boolean {
    return this.dirs.has(path);
  }

  list(dir: string): DirEntry[] {
    const prefix = dir === '' ? '' : `${dir}/`;
    const out = new Map<string, DirEntry>();
    const entry = (path: string, kind: 'file' | 'dir'): DirEntry => ({
      path,
      name: path.slice(prefix.length),
      kind,
      size: kind === 'file' ? new TextEncoder().encode(this.docs.get(path)?.saved ?? '').length : 0,
      mtimeMs: this.started,
      symlink: false,
    });
    for (const one of this.dirs) {
      if (one === '' || !one.startsWith(prefix) || one.slice(prefix.length).includes('/')) continue;
      out.set(one, entry(one, 'dir'));
    }
    for (const path of this.docs.keys()) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
      out.set(path, entry(path, 'file'));
    }
    return [...out.values()].sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1,
    );
  }

  state(path: string): DocState {
    const doc = this.require(path);
    return {
      path,
      text: doc.text,
      version: doc.version,
      revision: String(doc.revision),
      dirty: doc.text !== doc.saved,
      truncated: false,
      ...(this.behind.has(path) ? { diverged: 'changed' as const } : {}),
    };
  }

  /**
   * The file changed on disk while the editor holds unsaved edits: memory and disk now
   * disagree, and the argument is settled on the merge screen.
   */
  diverge(path: string, disk: string): void {
    this.require(path);
    this.behind.set(path, disk);
  }

  edit(path: string, text: string): DocVersion {
    const doc = this.require(path);
    doc.text = text;
    doc.version += 1;
    this.emit({ type: 'doc.changed', path });
    return { path, version: doc.version, dirty: doc.text !== doc.saved };
  }

  save(path: string): DocState {
    const doc = this.require(path);
    this.behind.delete(path);
    doc.saved = doc.text;
    doc.revision += 1;
    this.emit({ type: 'doc.saved', path });
    return this.state(path);
  }

  saved(path: string): string | null {
    return this.docs.get(path)?.saved ?? null;
  }

  unsaved(): string[] {
    return [...this.docs].filter(([, doc]) => doc.text !== doc.saved).map(([path]) => path);
  }

  write(path: string, text: string): void {
    const fresh = !this.docs.has(path);
    if (fresh) this.put(path, text);
    else {
      const doc = this.require(path);
      doc.text = text;
      doc.saved = text;
      doc.version += 1;
      doc.revision += 1;
    }
    this.emit(fresh ? { type: 'tree.changed', path: parentOf(path) } : { type: 'doc.external', path });
  }

  create(path: string, kind: 'file' | 'dir'): void {
    if (kind === 'dir') {
      this.dirs.add(path);
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join('/'));
    } else this.put(path, '');
    this.emit({ type: 'tree.changed', path: parentOf(path) });
  }

  remove(path: string): string[] {
    const gone: string[] = [];
    for (const one of [...this.docs.keys()]) {
      if (one === path || one.startsWith(`${path}/`)) {
        this.docs.delete(one);
        gone.push(one);
      }
    }
    for (const one of [...this.dirs]) if (one === path || one.startsWith(`${path}/`)) this.dirs.delete(one);
    this.emit({ type: 'tree.changed', path: parentOf(path) });
    return gone;
  }

  move(from: string, to: string): Array<{ from: string; to: string }> {
    const moved: Array<{ from: string; to: string }> = [];
    for (const [one, doc] of [...this.docs]) {
      if (one !== from && !one.startsWith(`${from}/`)) continue;
      const next = to + one.slice(from.length);
      this.docs.delete(one);
      this.put(next, doc.saved);
      const placed = this.docs.get(next)!;
      placed.text = doc.text;
      moved.push({ from: one, to: next });
    }
    for (const one of [...this.dirs]) {
      if (one !== from && !one.startsWith(`${from}/`)) continue;
      this.dirs.delete(one);
      this.dirs.add(to + one.slice(from.length));
    }
    this.emit({ type: 'tree.changed', path: parentOf(from) });
    this.emit({ type: 'tree.changed', path: parentOf(to) });
    return moved;
  }

  private require(path: string): Doc {
    const doc = this.docs.get(path);
    if (!doc) throw Object.assign(new Error(`No such file: ${path}`), { code: 1004 });
    return doc;
  }

  on(listener: (event: MemoryEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  files(): Iterable<{ path: string }> {
    return [...this.docs.keys()].map((path) => ({ path }));
  }

  docSync(path: string): MemoryDoc | null {
    const doc = this.docs.get(path);
    return doc ? this.memoryDoc(path, doc) : null;
  }

  async peekDoc(path: string): Promise<MemoryDoc> {
    return this.memoryDoc(path, this.require(path));
  }

  isTextual(path: string): boolean {
    return !/\.(png|jpe?g|gif|webp|ico)$/i.test(path);
  }

  async disk(path: string): Promise<{ text: string; revision: string } | null> {
    const doc = this.docs.get(path);
    if (!doc) return null;
    return { text: this.behind.get(path) ?? doc.saved, revision: String(doc.revision) };
  }

  async settle(path: string, text: string | null): Promise<void> {
    if (text === null) this.remove(path);
    else this.write(path, text);
  }

  async adopt(path: string, text: string | null): Promise<void> {
    if (text === null) return;
    this.edit(path, text);
  }

  private memoryDoc(path: string, doc: Doc): MemoryDoc {
    return {
      path,
      text: doc.text,
      version: doc.version,
      openCount: 0,
      ...(doc.text !== doc.saved ? { savedText: doc.saved } : {}),
    };
  }
}

export function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}
