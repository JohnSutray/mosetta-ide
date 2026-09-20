import fs from 'node:fs/promises';
import path from 'node:path';
import type { Stats } from 'node:fs';
import type { DirEntry, EntryKind, FsSettings } from '@mosetta/ide-protocol';
import { RpcErrorCode } from '@mosetta/ide-protocol';
import { RpcError } from '../errors.js';
import { paths } from '../workspace/paths.js';

/**
 * LAYER 3 — the operating system. The lowest one.
 *
 * It knows about disk and nothing else: not about documents, not about the index, not
 * about sessions. It is the only file in the server allowed to import `node:fs` —
 * checked by a test, so that the rule does not remain a pious wish.
 *
 * It reports upwards through events. The upper layers are NEVER called from here: the
 * dependency is strictly one-way.
 */

export interface OsEvent {
  type: 'wrote' | 'removed' | 'moved';
  /** A protocol key. For `moved` this is the new path: that is the current one. */
  path: string;
  revision?: string;
  /** Where it moved from. Only for `moved`. */
  from?: string;
}

/**
 * What the OS layer knows about a path. Deliberately NOT `fs.Stats`: a type from
 * `node:fs` in a signature would drag disk into the memory layer through the types.
 */
export interface OsStat {
  kind: EntryKind;
  size: number;
  mtimeMs: number;
  /** The same version stamp `read` and `write` use. */
  revision: string;
}

export interface OsFileText {
  path: string;
  text: string;
  revision: string;
  truncated: boolean;
  /**
   * The file turned out to hold bytes that do not occur in text. `text` is then empty:
   * handing rubbish outwards is worse than refusing.
   */
  binary: boolean;
}

/**
 * How many bytes from the start of a file we sniff while deciding "text or not".
 *
 * The same number git looks at. A zero byte near the beginning is the mark of almost
 * every binary format, and in those where it is absent from the first few kilobytes it
 * turns up on a full read.
 */
const SNIFF = 8192;

/**
 * Whether a chunk is binary: we look for a zero byte. That is how git decides, and it
 * is a rule rather than a list of extensions: an extension is a guess about a file,
 * whereas the bytes are the file.
 */
function looksBinary(buffer: Buffer): boolean {
  return buffer.indexOf(0) !== -1;
}

export class OsFs {
  private readonly listeners = new Set<(event: OsEvent) => void>();

  constructor(
    readonly root: string,
    private settings: FsSettings,
  ) {}

  applySettings(settings: FsSettings): void {
    this.settings = settings;
  }

  on(listener: (event: OsEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A directory's contents. Keys, not absolute paths. */
  async list(key: string): Promise<DirEntry[]> {
    const dirKey = paths.toKey(key);
    const absolute = paths.toAbsolute(this.root, dirKey);
    let dirents;
    try {
      dirents = await fs.readdir(absolute, { withFileTypes: true });
    } catch (err) {
      throw translate(err, dirKey, 'dir');
    }

    const hidden = new Set(this.settings.hidden);
    const noScan = new Set(this.settings.noScan);
    const entries: DirEntry[] = [];

    for (const dirent of dirents) {
      if (hidden.has(dirent.name)) continue;
      if (disk.isTempFile(dirent.name)) continue;
      const childKey = paths.joinKey(dirKey, dirent.name);
      let stat: Stats;
      try {
        stat = await fs.stat(path.join(absolute, dirent.name));
      } catch {
        continue;
      }
      if (!stat.isDirectory() && !stat.isFile()) continue;
      const isDir = stat.isDirectory();
      entries.push({
        path: childKey,
        name: dirent.name,
        kind: isDir ? 'dir' : 'file',
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        symlink: dirent.isSymbolicLink(),
        ...(isDir && noScan.has(dirent.name) ? { noScan: true } : {}),
      });
    }

    return disk.sortEntries(entries);
  }

  /** What lies at this path right now. `null` means nothing (or no access). */
  async stat(key: string): Promise<OsStat | null> {
    let stat: Stats;
    try {
      stat = await fs.stat(paths.toAbsolute(this.root, key));
    } catch {
      return null;
    }
    if (!stat.isDirectory() && !stat.isFile()) return null;
    return {
      kind: stat.isDirectory() ? 'dir' : 'file',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      revision: revisionOf(stat),
    };
  }

  async read(key: string): Promise<OsFileText> {
    const fileKey = paths.toKey(key);
    const absolute = paths.toAbsolute(this.root, fileKey);
    let stat: Stats;
    try {
      stat = await fs.stat(absolute);
    } catch (err) {
      throw translate(err, fileKey, 'file');
    }
    if (stat.isDirectory()) throw RpcError.wrongKind(fileKey, 'file');

    const limit = this.settings.maxFileMb * 1024 * 1024;
    const truncated = stat.size > limit;
    let bytes: Buffer;
    if (truncated) {
      const handle = await fs.open(absolute, 'r');
      try {
        const buffer = Buffer.allocUnsafe(limit);
        const { bytesRead } = await handle.read(buffer, 0, limit, 0);
        bytes = buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    } else {
      bytes = await fs.readFile(absolute);
    }

    const binary = looksBinary(bytes.subarray(0, SNIFF));
    return {
      path: fileKey,
      text: binary ? '' : bytes.toString('utf8'),
      revision: revisionOf(stat),
      truncated,
      binary,
    };
  }

  /**
   * Whether a file looks like text — CHEAPLY, from its beginning.
   *
   * Needed by the preload: it walks every file of the project, and reading each image
   * whole for the sake of the answer "this is an image" would be silly. Err towards
   * "text" and a full read will correct it.
   */
  async sniff(key: string): Promise<boolean> {
    const absolute = paths.toAbsolute(this.root, paths.toKey(key));
    let handle;
    try {
      handle = await fs.open(absolute, 'r');
    } catch {
      return false;
    }
    try {
      const buffer = Buffer.allocUnsafe(SNIFF);
      const { bytesRead } = await handle.read(buffer, 0, SNIFF, 0);
      return !looksBinary(buffer.subarray(0, bytesRead));
    } catch {
      return false;
    } finally {
      await handle.close();
    }
  }

  async write(
    key: string,
    text: string,
    expectedRevision?: string | null,
  ): Promise<{ path: string; revision: string }> {
    const fileKey = paths.toKey(key);
    const absolute = paths.toAbsolute(this.root, fileKey);

    let current: Stats | null = null;
    try {
      current = await fs.stat(absolute);
    } catch {
      current = null;
    }
    if (current?.isDirectory()) throw RpcError.wrongKind(fileKey, 'file');

    if (expectedRevision != null) {
      const actual = current ? revisionOf(current) : null;
      if (actual !== expectedRevision) {
        throw new RpcError(
          RpcErrorCode.RevisionConflict,
          `The file changed on disk: ${fileKey}`,
          { expected: expectedRevision, actual },
        );
      }
    }

    await fs.mkdir(path.dirname(absolute), { recursive: true });

    const temp = path.join(
      path.dirname(absolute),
      `.${path.basename(absolute)}.tmp-${process.pid}-${Date.now().toString(36)}`,
    );
    try {
      await fs.writeFile(temp, text, 'utf8');
      if (current) await fs.chmod(temp, current.mode);
      await fs.rename(temp, absolute);
    } catch (err) {
      await fs.rm(temp, { force: true }).catch(() => {});
      throw err;
    }

    const written = await fs.stat(absolute);
    const revision = revisionOf(written);
    this.emit({ type: 'wrote', path: fileKey, revision });
    return { path: fileKey, revision };
  }

  /**
   * Create a file or a directory.
   *
   * We do NOT overwrite what exists: "create" and "clobber" are different intentions,
   * and they must not be confused inside one button.
   */
  async create(key: string, kind: 'file' | 'dir'): Promise<DirEntry> {
    const fileKey = paths.toKey(key);
    const absolute = paths.toAbsolute(this.root, fileKey);
    if (await exists(absolute)) throw RpcError.invalidParams(`Already there: ${fileKey}`);

    if (kind === 'dir') {
      await fs.mkdir(absolute, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, '', { encoding: 'utf8', flag: 'wx' });
    }
    return this.describe(fileKey);
  }

  /**
   * Rename or move. One operation, because to a filesystem they are the same thing: the
   * path changes.
   */
  async move(from: string, to: string): Promise<DirEntry> {
    const fromKey = paths.toKey(from);
    const toKey_ = paths.toKey(to);
    const source = paths.toAbsolute(this.root, fromKey);
    const target = paths.toAbsolute(this.root, toKey_);
    if (!(await exists(source))) throw RpcError.notFound(fromKey);
    if (source !== target && (await exists(target))) {
      throw RpcError.invalidParams(`Already there: ${toKey_}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(source, target);
    this.emit({ type: 'moved', path: toKey_, from: fromKey });
    return this.describe(toKey_);
  }

  /** Copy a file or a whole directory. */
  async copy(from: string, to: string): Promise<DirEntry> {
    const fromKey = paths.toKey(from);
    const toKey_ = paths.toKey(to);
    const source = paths.toAbsolute(this.root, fromKey);
    const target = paths.toAbsolute(this.root, toKey_);
    if (!(await exists(source))) throw RpcError.notFound(fromKey);
    if (await exists(target)) throw RpcError.invalidParams(`Already there: ${toKey_}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false });
    return this.describe(toKey_);
  }

  /**
   * Delete. For good: Node has no system trash, and pretending it does is a lie. Asking
   * about that is the interface's job rather than the OS layer's.
   */
  async remove(key: string): Promise<void> {
    const fileKey = paths.toKey(key);
    if (fileKey === '') throw RpcError.invalidParams('The project root cannot be deleted');
    const absolute = paths.toAbsolute(this.root, fileKey);
    if (!(await exists(absolute))) throw RpcError.notFound(fileKey);
    await fs.rm(absolute, { recursive: true, force: true });
  }

  /** Put a binary file down — an image from the clipboard, for example. */
  async writeBytes(key: string, base64: string): Promise<DirEntry> {
    const fileKey = paths.toKey(key);
    const absolute = paths.toAbsolute(this.root, fileKey);
    if (await exists(absolute)) throw RpcError.invalidParams(`Already there: ${fileKey}`);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, Buffer.from(base64, 'base64'));
    return this.describe(fileKey);
  }

  /**
   * Read a file's bytes. Past memory: binaries do not live there, yet sometimes they
   * have to be shown — an image, say.
   *
   * We do not hand over more than the ceiling, and we SAY so (`truncated`): silent
   * truncation is the worst kind of error, and an image cut off in the middle looks
   * like a corrupted file.
   */
  async bytes(key: string, limit: number): Promise<{ path: string; base64: string; bytes: number; truncated: boolean }> {
    const fileKey = paths.toKey(key);
    const absolute = paths.toAbsolute(this.root, fileKey);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat || stat.isDirectory()) throw RpcError.notFound(fileKey);
    const truncated = stat.size > limit;
    const handle = await fs.open(absolute, 'r');
    try {
      const buffer = Buffer.alloc(Math.min(stat.size, limit));
      const read = await handle.read(buffer, 0, buffer.length, 0);
      return {
        path: fileKey,
        base64: buffer.subarray(0, read.bytesRead).toString('base64'),
        bytes: stat.size,
        truncated,
      };
    } finally {
      await handle.close();
    }
  }

  /** A ready tree entry for a path — in the same shape `list` hands over. */
  private async describe(key: string): Promise<DirEntry> {
    const absolute = paths.toAbsolute(this.root, key);
    const stat = await fs.stat(absolute);
    const isDir = stat.isDirectory();
    const name = key.slice(key.lastIndexOf('/') + 1);
    return {
      path: key,
      name,
      kind: isDir ? 'dir' : 'file',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      symlink: false,
      ...(isDir && new Set(this.settings.noScan).has(name) ? { noScan: true } : {}),
    };
  }

  /**
   * A file's version stamp. mtime and size: not cryptographically sound, but it catches
   * exactly what it is needed for — the file being rewritten past us.
   */
  static revision(stat: Stats): string {
    return revisionOf(stat);
  }

  private emit(event: OsEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

async function exists(absolute: string): Promise<boolean> {
  try {
    await fs.stat(absolute);
    return true;
  } catch {
    return false;
  }
}

function revisionOf(stat: Stats): string {
  return `${Math.round(stat.mtimeMs)}:${stat.size}`;
}

function translate(err: unknown, key: string, expected: 'file' | 'dir'): RpcError {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return RpcError.notFound(key);
  if (code === 'ENOTDIR') return RpcError.wrongKind(key, expected);
  if (code === 'EACCES' || code === 'EPERM') {
    return new RpcError(RpcErrorCode.NotFound, `No access: ${key}`);
  }
  return new RpcError(RpcErrorCode.Internal, String(err));
}

/** Questions for disk that need no open project. */
export class Disk {
  /**
   * Move a directory if there is nothing at the new place yet. For one-off migrations:
   * `false` means there was nothing to move, or it has been moved already.
   */
  async moveOnce(from: string, to: string): Promise<boolean> {
    try {
      await fs.access(to);
      return false;
    } catch {}
    try {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(from, to);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate and canonicalise a project root before a workspace exists at all. It lives
   * here rather than in the registry for the same reason as everything else in this
   * file: asking disk "does this path exist and where does it really point" is the OS
   * layer's knowledge. The registry is obliged to ask rather than to know — which a
   * layering test caught on its very first run.
   */
  async probeRoot(input: string): Promise<string> {
    const expanded = paths.expandRoot(input);
    let real: string;
    try {
      real = await fs.realpath(expanded);
    } catch {
      throw new RpcError(RpcErrorCode.BadRoot, `The path does not exist: ${expanded}`);
    }
    const stat = await fs.stat(real);
    if (!stat.isDirectory()) {
      throw new RpcError(RpcErrorCode.BadRoot, `Not a directory: ${real}`);
    }
    return real;
  }

  /**
   * Editors' temporary files, including our own while writing.
   *
   * It lives in the OS layer rather than in the watcher: this is knowledge about DISK,
   * and both halves of the layer need it — the walk and the event parsing alike. One
   * expression for the two of them, otherwise they drift apart.
   */
  readonly tempFile = /(^\.#)|(~$)|(\.sw[px]$)|(^\..*\.tmp-\d+-)/;

  isTempFile(name: string): boolean {
    return this.tempFile.test(name);
  }

  /** Directories first, then alphabetically, ignoring case — as in IDEA's tree. */
  sortEntries(entries: DirEntry[]): DirEntry[] {
    return entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
    });
  }
}

/** One per process: the OS layer, the only one allowed to touch node:fs. */
export const disk = new Disk();
