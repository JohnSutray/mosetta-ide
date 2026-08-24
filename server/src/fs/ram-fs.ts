import type { DirEntry, DocState, FsSettings, IndexStats } from '@ide/protocol';
import { RpcErrorCode } from '@ide/protocol';
import { RpcError } from '../errors.js';
import type { Logger } from '../log.js';
import { baseName, extensionOf } from '../workspace/paths.js';
import type { OsFs } from './os-fs.js';

export interface Doc {
  path: string;
  text: string;
  version: number;
  revision: string | null;
  dirty: boolean;
  truncated: boolean;
  openCount: number;
  savedText?: string;
}

export type RamEvent =
  | { type: 'doc.resident'; path: string }
  | { type: 'doc.opened'; path: string }
  | { type: 'doc.changed'; path: string; version: number; dirty: boolean }
  | { type: 'doc.saved'; path: string; revision: string }
  | { type: 'doc.external'; path: string; revision: string }
  | { type: 'doc.conflict'; path: string; reason: 'changed' | 'removed' }
  | { type: 'doc.closed'; path: string }
  | { type: 'doc.removed'; path: string }
  | { type: 'doc.moved'; path: string; from: string }
  | { type: 'tree.changed'; path: string };

interface DirNode {
  entries: DirEntry[];
  scanned: boolean;
}

export class RamFs {
  private readonly dirs = new Map<string, DirNode>();
  private readonly docs = new Map<string, Doc>();
  private readonly listeners = new Set<(event: RamEvent) => void>();
  private readonly loading = new Map<string, Promise<Doc>>();
  private readonly writing = new Set<string>();
  private bytesResident = 0;
  private builtMs = 0;
  private fileCount = 0;
  private preloading: Promise<void> | null = null;
  private disposed = false;
  private readonly offOs: () => void;

  constructor(
    private readonly os: OsFs,
    private settings: FsSettings,
    private readonly log: Logger,
  ) {
    this.offOs = os.on((event) => {
      if (event.type === 'moved' && event.from !== undefined) {
        void this.onDiskMove(event.from, event.path);
        return;
      }
      if (event.type !== 'wrote' || !event.revision) return;
      this.onDiskWrite(event.path, event.revision);
    });
  }

  applySettings(settings: FsSettings): void {
    this.settings = settings;
  }

  on(listener: (event: RamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.disposed = true;
    this.offOs();
    this.listeners.clear();
    this.dirs.clear();
    this.docs.clear();
  }

  async prime(): Promise<void> {
    const started = Date.now();
    await this.scan('');
    this.builtMs = Date.now() - started;
    this.log.info(
      `дерево в памяти: ${this.fileCount} файлов, ${this.dirs.size} папок за ${this.builtMs} мс`,
    );
  }

  private async scan(key: string): Promise<void> {
    if (this.disposed) return;
    const entries = await this.os.list(key).catch(() => [] as DirEntry[]);
    this.dirs.set(key, { entries, scanned: true });
    this.fileCount += entries.filter((e) => e.kind === 'file').length;
    for (const entry of entries) {
      if (entry.kind !== 'dir') continue;
      if (entry.noScan) {
        continue;
      }
      await this.scan(entry.path);
    }
  }

  listSync(key: string): DirEntry[] | undefined {
    return this.dirs.get(key)?.entries;
  }

  async list(key: string): Promise<DirEntry[]> {
    const cached = this.dirs.get(key);
    if (cached) return cached.entries;
    const entries = await this.os.list(key);
    this.dirs.set(key, { entries, scanned: false });
    return entries;
  }

  *files(): Generator<DirEntry> {
    for (const node of this.dirs.values()) {
      for (const entry of node.entries) {
        if (entry.kind === 'file') yield entry;
      }
    }
  }

  stats(): IndexStats {
    let dirs = 0;
    let files = 0;
    for (const node of this.dirs.values()) {
      dirs += 1;
      files += node.entries.filter((e) => e.kind === 'file').length;
    }
    return { files, dirs, bytesResident: this.bytesResident, builtMs: this.builtMs };
  }

  preload(): Promise<void> {
    this.preloading ??= this.runPreload().catch((err) => {
      this.log.warn(`предзагрузка прервана: ${String(err)}`);
    });
    return this.preloading;
  }

  private async runPreload(): Promise<void> {
    const budget = this.settings.preloadBudgetMb * 1024 * 1024;
    const textual = new Set(this.settings.textExtensions);
    const limit = this.settings.maxFileMb * 1024 * 1024;
    let loaded = 0;

    const candidates = [...this.files()]
      .filter((e) => textual.has(extensionOf(e.path)) && e.size <= limit)
      .sort((a, b) => a.size - b.size);

    for (const entry of candidates) {
      if (this.disposed) return;
      if (this.bytesResident + entry.size > budget) break;
      if (this.docs.has(entry.path)) continue;
      try {
        await this.residentize(entry.path);
        loaded += 1;
      } catch {}
    }
    this.log.info(
      `в памяти ${loaded} файлов, ${(this.bytesResident / 1024 / 1024).toFixed(1)} МБ`,
    );
  }

  private residentize(key: string): Promise<Doc> {
    const existing = this.docs.get(key);
    if (existing) return Promise.resolve(existing);
    const inflight = this.loading.get(key);
    if (inflight) return inflight;

    const load = this.readIntoMemory(key).finally(() => this.loading.delete(key));
    this.loading.set(key, load);
    return load;
  }

  private async readIntoMemory(key: string): Promise<Doc> {
    const file = await this.os.read(key);
    const raced = this.docs.get(key);
    if (raced) return raced;
    const doc: Doc = {
      path: file.path,
      text: file.text,
      version: 0,
      revision: file.revision,
      dirty: false,
      truncated: file.truncated,
      openCount: 0,
    };
    this.docs.set(doc.path, doc);
    this.bytesResident += doc.text.length;
    this.emit({ type: 'doc.resident', path: doc.path });
    return doc;
  }

  docSync(key: string): Doc | undefined {
    return this.docs.get(key);
  }

  peekDoc(key: string): Promise<Doc> {
    return this.residentize(key);
  }

  async openDoc(key: string): Promise<Doc> {
    const doc = this.docs.get(key) ?? (await this.residentize(key));
    doc.openCount += 1;
    this.emit({ type: 'doc.opened', path: doc.path });
    return doc;
  }

  editDoc(key: string, text: string, baseVersion: number): Doc {
    const doc = this.requireDoc(key);
    if (doc.truncated) {
      throw new RpcError(RpcErrorCode.WrongKind, `Файл только для чтения: ${key}`);
    }
    if (doc.version !== baseVersion) {
      throw new RpcError(
        RpcErrorCode.StaleVersion,
        `Документ ушёл вперёд: ${key}`,
        { expected: doc.version, got: baseVersion },
      );
    }
    doc.savedText ??= doc.text;
    this.bytesResident += text.length - doc.text.length;
    doc.text = text;
    doc.version += 1;
    doc.dirty = doc.text !== doc.savedText;
    if (!doc.dirty) delete doc.savedText;
    this.emit({ type: 'doc.changed', path: doc.path, version: doc.version, dirty: doc.dirty });
    return doc;
  }

  async saveDoc(key: string): Promise<Doc> {
    const doc = this.requireDoc(key);
    this.writing.add(doc.path);
    let result;
    try {
      result = await this.os.write(doc.path, doc.text, doc.revision);
      doc.revision = result.revision;
      doc.dirty = false;
      delete doc.savedText;
    } catch (err) {
      if (err instanceof RpcError && err.code === RpcErrorCode.RevisionConflict) {
        this.emit({ type: 'doc.conflict', path: doc.path, reason: 'changed' });
      }
      throw err;
    } finally {
      this.writing.delete(doc.path);
    }
    this.emit({ type: 'doc.saved', path: doc.path, revision: result.revision });
    this.emit({ type: 'doc.changed', path: doc.path, version: doc.version, dirty: false });
    return doc;
  }

  async resolveDoc(key: string, text: string | null): Promise<void> {
    if (text === null) {
      this.writing.add(key);
      try {
        await this.os.remove(key);
      } catch {} finally {
        this.writing.delete(key);
      }
      const doc = this.docs.get(key);
      if (doc) {
        this.bytesResident -= doc.text.length;
        this.docs.delete(key);
        this.emit({ type: 'doc.removed', path: key });
      }
      this.emit({ type: 'tree.changed', path: parentOf(key) });
      return;
    }

    this.writing.add(key);
    let revision: string;
    try {
      revision = (await this.os.write(key, text)).revision;
    } finally {
      this.writing.delete(key);
    }

    const doc = this.docs.get(key);
    if (!doc) {
      this.emit({ type: 'tree.changed', path: parentOf(key) });
      return;
    }
    this.bytesResident += text.length - doc.text.length;
    doc.text = text;
    doc.revision = revision;
    doc.version += 1;
    doc.dirty = false;
    delete doc.savedText;
    this.emit({ type: 'doc.changed', path: key, version: doc.version, dirty: false });
    this.emit({ type: 'doc.saved', path: key, revision });
    this.emit({ type: 'doc.external', path: key, revision });
  }

  async reloadDoc(key: string): Promise<Doc> {
    const file = await this.os.read(key);
    const doc = this.docs.get(key);
    if (!doc) return this.residentize(key);
    this.bytesResident += file.text.length - doc.text.length;
    doc.text = file.text;
    doc.revision = file.revision;
    doc.truncated = file.truncated;
    doc.dirty = false;
    delete doc.savedText;
    doc.version += 1;
    this.emit({ type: 'doc.changed', path: doc.path, version: doc.version, dirty: false });
    return doc;
  }

  closeDoc(key: string): void {
    const doc = this.docs.get(key);
    if (!doc) return;
    doc.openCount = Math.max(0, doc.openCount - 1);
    if (doc.openCount === 0) this.emit({ type: 'doc.closed', path: doc.path });
  }

  private requireDoc(key: string): Doc {
    const doc = this.docs.get(key);
    if (!doc) {
      throw new RpcError(RpcErrorCode.DocNotOpen, `Документ не открыт: ${key}`);
    }
    return doc;
  }

  async syncFromDisk(keys: string[]): Promise<void> {
    if (this.disposed) return;
    const ordered = [...new Set(keys)].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));

    const dirsToRefresh = new Set<string>();

    for (const key of ordered) {
      if (this.disposed) return;
      const stat = await this.os.stat(key);

      if (!stat) {
        if (this.forget(key)) dirsToRefresh.add(parentOf(key));
        continue;
      }

      if (stat.kind === 'dir') {
        dirsToRefresh.add(parentOf(key));
        if (!this.dirs.has(key) && !this.isNoScan(key)) {
          await this.scan(key);
        }
        continue;
      }

      dirsToRefresh.add(parentOf(key));
      await this.syncFile(key, stat.revision);
    }

    await this.refreshDirs(dirsToRefresh);
  }

  private async refreshDirs(dirs: Iterable<string>): Promise<void> {
    for (const dir of dirs) {
      if (!this.dirs.has(dir)) continue;
      try {
        const entries = await this.os.list(dir);
        this.dirs.set(dir, { entries, scanned: true });
        this.emit({ type: 'tree.changed', path: dir });
      } catch {}
    }
  }

  private async onDiskMove(from: string, to: string): Promise<void> {
    if (this.disposed) return;

    const prefix = `${from}/`;
    const moved: Array<{ from: string; to: string }> = [];
    for (const key of [...this.docs.keys()]) {
      if (key !== from && !key.startsWith(prefix)) continue;
      const doc = this.docs.get(key)!;
      const next = key === from ? to : `${to}/${key.slice(prefix.length)}`;
      this.docs.delete(key);
      doc.path = next;
      this.docs.set(next, doc);
      moved.push({ from: key, to: next });
    }

    for (const dirKey of [...this.dirs.keys()]) {
      if (dirKey === from || dirKey.startsWith(prefix)) this.dirs.delete(dirKey);
    }

    for (const item of moved) this.emit({ type: 'doc.moved', path: item.to, from: item.from });
    await this.refreshDirs(new Set([parentOf(from), parentOf(to)]));
  }

  private async syncFile(key: string, revision: string): Promise<void> {
    if (this.writing.has(key)) return;
    const doc = this.docs.get(key);
    if (!doc) return;
    if (doc.revision === revision) return;

    if (doc.dirty) {
      this.emit({ type: 'doc.conflict', path: key, reason: 'changed' });
      return;
    }
    try {
      await this.reloadDoc(key);
      this.emit({ type: 'doc.external', path: key, revision });
    } catch {}
  }

  private forget(key: string): boolean {
    let touched = false;

    const doc = this.docs.get(key);
    if (doc?.dirty) {
      this.emit({ type: 'doc.conflict', path: key, reason: 'removed' });
      return true;
    }
    if (doc) {
      this.bytesResident -= doc.text.length;
      this.docs.delete(key);
      this.emit({ type: 'doc.removed', path: key });
      touched = true;
    }

    if (this.dirs.has(key)) {
      const prefix = `${key}/`;
      for (const dirKey of [...this.dirs.keys()]) {
        if (dirKey === key || dirKey.startsWith(prefix)) this.dirs.delete(dirKey);
      }
      for (const docKey of [...this.docs.keys()]) {
        if (!docKey.startsWith(prefix)) continue;
        const gone = this.docs.get(docKey)!;
        if (gone.dirty) {
          this.emit({ type: 'doc.conflict', path: docKey, reason: 'removed' });
          continue;
        }
        this.bytesResident -= gone.text.length;
        this.docs.delete(docKey);
        this.emit({ type: 'doc.removed', path: docKey });
      }
      touched = true;
    }

    const parent = this.dirs.get(parentOf(key));
    if (parent?.entries.some((entry) => entry.path === key)) touched = true;

    return touched;
  }

  private isNoScan(key: string): boolean {
    return this.settings.noScan.includes(baseName(key));
  }

  private onDiskWrite(key: string, revision: string): void {
    if (this.writing.has(key)) return;
    const doc = this.docs.get(key);
    if (!doc) {
      this.emit({ type: 'tree.changed', path: parentOf(key) });
      return;
    }
    if (doc.revision === revision) return;
    if (doc.dirty) {
      this.emit({ type: 'doc.conflict', path: key, reason: 'changed' });
      return;
    }
    void this.reloadDoc(key)
      .then(() => this.emit({ type: 'doc.external', path: key, revision }))
      .catch(() => {});
  }

  private emit(event: RamEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export function toDocState(doc: Doc): DocState {
  return {
    path: doc.path,
    text: doc.text,
    version: doc.version,
    revision: doc.revision,
    dirty: doc.dirty,
    truncated: doc.truncated,
  };
}

function parentOf(key: string): string {
  const at = key.lastIndexOf('/');
  return at === -1 ? '' : key.slice(0, at);
}

function depth(key: string): number {
  return key === '' ? 0 : key.split('/').length;
}
