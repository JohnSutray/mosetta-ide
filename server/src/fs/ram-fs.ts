import type { DirEntry, DocState, FsSettings, IndexStats } from '@mosetta/ide-protocol';
import { RpcErrorCode } from '@mosetta/ide-protocol';
import { RpcError } from '../errors.js';
import type { Logger } from '../log.js';
import { paths } from '../workspace/paths.js';
import type { OsFs } from './os-fs.js';

/**
 * LAYER 2 — the filesystem in RAM. The truth as far as the editor is concerned.
 *
 * Greedy: when a project opens, the tree is walked whole and stays in memory, and the
 * sources are pulled in in the background up to a budget. Hence the main property the
 * layer exists for: `listSync` and `docSync` are SYNCHRONOUS. No key ever waits for
 * disk.
 *
 * Downwards it goes only through the OS layer; `node:fs` is never imported here.
 * Upwards, only events. The index and the language servers read those and have no right
 * to poke at disk themselves.
 */

export interface Doc {
  path: string;
  text: string;
  /** The edit counter IN MEMORY. It rises on every edit and has nothing to do with disk. */
  version: number;
  /** The disk stamp we count from. `null` means the file is not on disk yet. */
  revision: string | null;
  dirty: boolean;
  truncated: boolean;
  /**
   * Disk moved away while there are unsaved edits here.
   *
   * Held as a FACT about the document rather than as a single event: an event is seen
   * only by the tab that happened to be on screen that second, whereas the document
   * stays diverged until the argument has been settled.
   */
  diverged?: 'changed' | 'removed';
  /**
   * How many times the document was opened explicitly, by an editor. For
   * didOpen/didClose.
   */
  openCount: number;
  /**
   * The text as it lies on disk. Created on the first edit and living while the
   * document is dirty: only that way can `dirty` be the truth rather than "someone
   * touched it once". Undo the edits and the "changed" mark goes out by itself. Memory
   * is spent only on changed documents rather than on every resident one.
   */
  savedText?: string;
}

export type RamEvent =
  | { type: 'doc.resident'; path: string }
  | { type: 'doc.opened'; path: string }
  | { type: 'doc.changed'; path: string; version: number; dirty: boolean }
  | { type: 'doc.saved'; path: string; revision: string }
  | { type: 'doc.external'; path: string; revision: string }
  /**
   * The memory has parted company with the disk. This is a FACT rather than a conflict:
   * nobody is blocked by anything, each has a text of their own. The tab will show a
   * plate, and an argument only becomes necessary when an action runs into it.
   *
   * `changed` — the text on disk is different; `removed` — the file is no longer there.
   */
  | { type: 'doc.diverged'; path: string; reason: 'changed' | 'removed' }
  /**
   * The saving did not happen: the disk has moved on. THAT is a conflict — an action
   * the human asked for cannot carry itself out.
   */
  | { type: 'doc.saveBlocked'; path: string }
  | { type: 'doc.closed'; path: string }
  | { type: 'doc.removed'; path: string }
  /**
   * The document has moved: the path is new, the contents and the edits are the same.
   * `path` is where to, `from` is where from; `path` counts as the current one, so
   * subscribers who care only about it work unchanged.
   */
  | { type: 'doc.moved'; path: string; from: string }
  | { type: 'tree.changed'; path: string };

/**
 * Whether two settings lists are the same. The order does not matter, and there are no
 * duplicates.
 */
function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((one) => b.includes(one));
}

interface DirNode {
  entries: DirEntry[];
  /** Whether we walked it greedily. For `noScan` this is false: it is read lazily. */
  scanned: boolean;
}

export class RamFs {
  private readonly dirs = new Map<string, DirNode>();
  private readonly docs = new Map<string, Doc>();
  private readonly listeners = new Set<(event: RamEvent) => void>();
  /**
   * Reads already in flight. Without this, the background preload and a `doc.open` can
   * read one file at the same time, and the second result overwrites the first — along
   * with its version and its edits. Caught by a test.
   */
  private readonly loading = new Map<string, Promise<Doc>>();
  /**
   * Files we are writing ourselves right now.
   *
   * Our own write reaches us by two routes — a `wrote` event from the OS layer and a
   * watcher event — and both arrive BEFORE the save has managed to write the new
   * revision into the document. Without this mark the editor declares a conflict with
   * itself on every save (caught by a test).
   */
  private readonly writing = new Set<string>();
  private bytesResident = 0;
  private builtMs = 0;
  private fileCount = 0;
  private preloading: Promise<void> | null = null;
  /**
   * Files that turned out to be binary when read.
   *
   * Remembered so as not to read them again, and so that "not text" can be told from
   * "has not arrived yet": those are different ailments, cured differently.
   */
  private readonly binaries = new Set<string>();
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
    const before = this.settings;
    this.settings = settings;
    if (same(before.noScan, settings.noScan) && same(before.hidden, settings.hidden)) return;
    void this.reprime().catch((err) => this.log.warn(`rebuilding the tree: ${String(err)}`));
  }

  /**
   * Walk again, and tell everyone who remembers the old state.
   *
   * Events are sent both for the new directories and for the ones we knew BEFORE: a
   * directory may have moved into `noScan` and vanished from memory while staying on
   * screen.
   */
  private async reprime(): Promise<void> {
    const known = [...this.dirs.keys()];
    this.dirs.clear();
    this.fileCount = 0;
    await this.prime();
    for (const key of new Set([...known, ...this.dirs.keys()])) {
      this.emit({ type: 'tree.changed', path: key });
    }
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

  /** The greedy walk. Directories from `noScan` are shown, but we do not go inside. */
  async prime(): Promise<void> {
    const started = Date.now();
    await this.scan('');
    this.builtMs = Date.now() - started;
    this.log.info(
      `tree in memory: ${this.fileCount} files, ${this.dirs.size} directories in ${this.builtMs} ms`,
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

  /**
   * A synchronous read from memory. `undefined` means the directory was not walked
   * greedily.
   */
  listSync(key: string): DirEntry[] | undefined {
    return this.dirs.get(key)?.entries;
  }

  /**
   * From memory, or — if the directory was not walked (`noScan`) — from disk and into
   * memory.
   */
  async list(key: string): Promise<DirEntry[]> {
    const cached = this.dirs.get(key);
    if (cached) return cached.entries;
    const entries = await this.os.list(key);
    this.dirs.set(key, { entries, scanned: false });
    return entries;
  }

  /** Every known file. The index is built from this and from nothing else. */
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

  /**
   * Whether we consider this file textual.
   *
   * The answer comes from the CONTENTS rather than from the name: there used to be a
   * list of extensions here, and everything absent from it silently dropped out of
   * search — along with `.gitignore`, `Dockerfile` and every language we had not
   * enumerated. Now "not text" means "we read it and saw that it is not text"; about
   * something unread we answer YES — not seen is not sentenced.
   *
   * The index asks when a result supplier is waiting for a file that is not in memory:
   * "has not loaded yet" and "will never load" are different ailments, cured
   * differently.
   */
  isTextual(path: string): boolean {
    return !this.binaries.has(path);
  }

  preload(): Promise<void> {
    this.preloading ??= this.runPreload().catch((err) => {
      this.log.warn(`preload interrupted: ${String(err)}`);
    });
    return this.preloading;
  }

  private async runPreload(): Promise<void> {
    const budget = this.settings.preloadBudgetMb * 1024 * 1024;
    const limit = this.settings.maxFileMb * 1024 * 1024;
    let loaded = 0;

    const candidates = [...this.files()]
      .filter((e) => e.size <= limit)
      .sort((a, b) => a.size - b.size);

    for (const entry of candidates) {
      if (this.disposed) return;
      if (this.bytesResident + entry.size > budget) break;
      if (this.docs.has(entry.path)) continue;
      if (this.binaries.has(entry.path)) continue;
      if (!(await this.os.sniff(entry.path))) {
        this.binaries.add(entry.path);
        continue;
      }
      try {
        await this.residentize(entry.path);
        loaded += 1;
      } catch {}
    }
    this.log.info(
      `in memory: ${loaded} files, ${(this.bytesResident / 1024 / 1024).toFixed(1)} MB`,
    );
  }

  /**
   * Drag a file into memory. Idempotent and race-free: a document already loaded comes
   * back as it is, and parallel calls share one read.
   */
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
    if (file.binary) {
      this.binaries.add(file.path);
      throw new RpcError(RpcErrorCode.WrongKind, `Not a text file: ${key}`);
    }
    this.binaries.delete(file.path);
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

  /** Synchronously — if the file is in memory already. The fast path for hotkeys. */
  docSync(key: string): Doc | undefined {
    return this.docs.get(key);
  }

  /**
   * Pull a document into memory WITHOUT counting it as an open. Needed by the preview
   * in search, and by everything that reads a file in passing.
   */
  peekDoc(key: string): Promise<Doc> {
    return this.residentize(key);
  }

  async openDoc(key: string): Promise<Doc> {
    const doc = this.docs.get(key) ?? (await this.residentize(key));
    doc.openCount += 1;
    this.emit({ type: 'doc.opened', path: doc.path });
    return doc;
  }

  /**
   * An edit. `baseVersion` is the one the client started from: if the versions have
   * diverged, another tab has touched the document, and gluing the texts together
   * silently is not on.
   */
  editDoc(key: string, text: string, baseVersion: number): Doc {
    const doc = this.requireDoc(key);
    if (doc.truncated) {
      throw new RpcError(RpcErrorCode.WrongKind, `The file is read-only: ${key}`);
    }
    if (doc.version !== baseVersion) {
      throw new RpcError(
        RpcErrorCode.StaleVersion,
        `The document moved ahead: ${key}`,
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

  /** A write downwards, to disk. The only place where memory pushes into the OS. */
  async saveDoc(key: string): Promise<Doc> {
    const doc = this.requireDoc(key);
    this.writing.add(doc.path);
    let result;
    try {
      result = await this.os.write(doc.path, doc.text, doc.revision);
      doc.revision = result.revision;
      doc.dirty = false;
      delete doc.savedText;
      delete doc.diverged;
    } catch (err) {
      if (err instanceof RpcError && err.code === RpcErrorCode.RevisionConflict) {
        this.emit({ type: 'doc.saveBlocked', path: doc.path });
      }
      throw err;
    } finally {
      this.writing.delete(doc.path);
    }
    this.emit({ type: 'doc.saved', path: doc.path, revision: result.revision });
    this.emit({ type: 'doc.changed', path: doc.path, version: doc.version, dirty: false });
    return doc;
  }

  /**
   * A merge's verdict: the assembled text becomes both memory and disk. `null` means
   * the human accepted the file's deletion.
   *
   * We write WITHOUT checking the revision, deliberately: both versions have just been
   * shown to the human whole, and optimistic locking here would argue with the very
   * decision it was opened for.
   */
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
    delete doc.diverged;
    this.emit({ type: 'doc.changed', path: key, version: doc.version, dirty: false });
    this.emit({ type: 'doc.saved', path: key, revision });
    this.emit({ type: 'doc.external', path: key, revision });
  }

  /**
   * A merge's verdict that stays IN MEMORY.
   *
   * This is the session's second direction: the human pressed not "save" but "reload",
   * i.e. asked to pull somebody else's version in without throwing their own away. Disk
   * is not touched at all — only what we hold changes, and the document stays exactly
   * as dirty as the result diverged from disk.
   *
   * `null` means the human accepted the deletion: the document is gone.
   */
  async adoptDoc(key: string, text: string | null): Promise<void> {
    const doc = this.requireDoc(key);

    if (text === null) {
      this.bytesResident -= doc.text.length;
      this.docs.delete(key);
      this.emit({ type: 'doc.removed', path: key });
      return;
    }

    const stat = await this.os.stat(key);
    const disk = stat && stat.kind === 'file' ? await this.os.read(key) : null;

    this.bytesResident += text.length - doc.text.length;
    doc.text = text;
    doc.revision = disk ? disk.revision : null;
    doc.truncated = disk ? disk.truncated : doc.truncated;
    doc.version += 1;
    if (disk && disk.text === text) {
      doc.dirty = false;
      delete doc.savedText;
      delete doc.diverged;
    } else {
      doc.savedText = disk ? disk.text : '';
      doc.dirty = true;
      doc.diverged = 'changed';
    }

    this.emit({ type: 'doc.changed', path: key, version: doc.version, dirty: doc.dirty });
    this.emit({ type: 'doc.external', path: key, revision: doc.revision ?? '' });
  }

  /** Take it from disk afresh, throwing away the edits held in memory. */
  async reloadDoc(key: string): Promise<Doc> {
    const file = await this.os.read(key);
    if (file.binary) {
      this.binaries.add(file.path);
      throw new RpcError(RpcErrorCode.WrongKind, `Not a text file: ${key}`);
    }
    const doc = this.docs.get(key);
    if (!doc) return this.residentize(key);
    this.bytesResident += file.text.length - doc.text.length;
    doc.text = file.text;
    doc.revision = file.revision;
    doc.truncated = file.truncated;
    doc.dirty = false;
    delete doc.savedText;
    delete doc.diverged;
    doc.version += 1;
    this.emit({ type: 'doc.changed', path: doc.path, version: doc.version, dirty: false });
    return doc;
  }

  /**
   * Close in the sense of "the editor is no longer looking". The text stays in memory:
   * the layer is greedy for a reason, and reopening has to be instant.
   */
  closeDoc(key: string): void {
    const doc = this.docs.get(key);
    if (!doc) return;
    doc.openCount = Math.max(0, doc.openCount - 1);
    if (doc.openCount === 0) this.emit({ type: 'doc.closed', path: doc.path });
  }

  private requireDoc(key: string): Doc {
    const doc = this.docs.get(key);
    if (!doc) {
      throw new RpcError(RpcErrorCode.DocNotOpen, `The document is not open: ${key}`);
    }
    return doc;
  }

  /**
   * Make sense of the paths the watcher pointed at.
   *
   * The watcher only says "look here" — the truth comes from a `stat` here and now.
   * That is the only way not to guess: `fs.watch` sends one and the same event for a
   * creation and for a deletion, collapses batches and arrives late.
   *
   * The decision is taken HERE rather than in the OS layer, because only memory knows
   * whether a document holds unsaved edits. Below, it does not know that; above, it
   * does not know about disk.
   */
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

  /**
   * Re-read directories whole instead of performing surgery on the list: one readdir is
   * cheaper than five branches of "insert / update / reorder", and it sorts out the
   * ordering, the symlinks and the noScan flag along the way.
   */
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

  /**
   * A file or directory moved by our hands.
   *
   * The document is NOT thrown away: its key changes, and that is all — the text, the
   * version, the unsaved edits and the open counter stay with it. To the editor this is
   * the same file under a new path rather than "died and was reborn", and that is
   * precisely why the event comes from here rather than from the watcher: the watcher
   * sees two separate events and knows nothing of their kinship.
   */
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
    if (this.writing.has(key)) return;     const doc = this.docs.get(key);
    if (!doc) return;     if (doc.revision === revision) return; 
    if (doc.dirty) {
      doc.diverged = 'changed';
      this.emit({ type: 'doc.diverged', path: key, reason: 'changed' });
      return;
    }
    try {
      await this.reloadDoc(key);
      this.emit({ type: 'doc.external', path: key, revision });
    } catch {}
  }

  /**
   * Remove from memory a path that is no longer on disk.
   *
   * With one exception: if the document holds unsaved edits, it is NOT thrown away. The
   * file was deleted from outside while the human's work is still alive — that is an
   * argument between two versions, and settling it is theirs: accept the deletion, or
   * write their own text back. The edits used to be simply declared dead along with the
   * file.
   */
  private forget(key: string): boolean {
    let touched = false;

    const doc = this.docs.get(key);
    if (doc?.dirty) {
      doc.diverged = 'removed';
      this.emit({ type: 'doc.diverged', path: key, reason: 'removed' });
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
          gone.diverged = 'removed';
          this.emit({ type: 'doc.diverged', path: docKey, reason: 'removed' });
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
    return this.settings.noScan.includes(paths.baseName(key));
  }

  private onDiskWrite(key: string, revision: string): void {
    if (this.writing.has(key)) return;     const doc = this.docs.get(key);
    if (!doc) {
      this.emit({ type: 'tree.changed', path: parentOf(key) });
      return;
    }
    if (doc.revision === revision) return;     if (doc.dirty) {
      doc.diverged = 'changed';
      this.emit({ type: 'doc.diverged', path: key, reason: 'changed' });
      return;
    }
    void this.reloadDoc(key)
      .then(() => this.emit({ type: 'doc.external', path: key, revision }))
      .catch(() => {});
  }

  private emit(event: RamEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /**
   * The paths whose memory has diverged from disk.
   *
   * The memory layer is the only one that knows this in full: a tab sees ONE open
   * document, whereas a dirty one lives here even after being closed (closing does not
   * throw unsaved work away). It is asked before a program is launched: the program
   * reads disk while the human is looking at memory.
   *
   * Ordered by path: the list is shown to a human, and it must not reshuffle depending
   * on the order files happened to enter memory.
   */
  unsavedDocs(): string[] {
    return [...this.docs.values()].filter((doc) => doc.dirty).map((doc) => doc.path).sort();
  }

  toDocState(doc: Doc): DocState {
    return {
      path: doc.path,
      text: doc.text,
      version: doc.version,
      revision: doc.revision,
      dirty: doc.dirty,
      truncated: doc.truncated,
      ...(doc.diverged ? { diverged: doc.diverged } : {}),
    };
  }
}

function parentOf(key: string): string {
  const at = key.lastIndexOf('/');
  return at === -1 ? '' : key.slice(0, at);
}

function depth(key: string): number {
  return key === '' ? 0 : key.split('/').length;
}
