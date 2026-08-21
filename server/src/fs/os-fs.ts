import fs from 'node:fs/promises';
import path from 'node:path';
import type { Stats } from 'node:fs';
import type { DirEntry, EntryKind, FsSettings } from '@ide/protocol';
import { RpcErrorCode } from '@ide/protocol';
import { RpcError } from '../errors.js';
import { expandRoot, joinKey, toAbsolute, toKey } from '../workspace/paths.js';

export interface OsEvent {
  type: 'wrote' | 'removed';
  path: string;
  revision?: string;
}

export interface OsStat {
  kind: EntryKind;
  size: number;
  mtimeMs: number;
  revision: string;
}

export interface OsFileText {
  path: string;
  text: string;
  revision: string;
  truncated: boolean;
}

export async function probeRoot(input: string): Promise<string> {
  const expanded = expandRoot(input);
  let real: string;
  try {
    real = await fs.realpath(expanded);
  } catch {
    throw new RpcError(RpcErrorCode.BadRoot, `Путь не существует: ${expanded}`);
  }
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) {
    throw new RpcError(RpcErrorCode.BadRoot, `Не директория: ${real}`);
  }
  return real;
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

  async list(key: string): Promise<DirEntry[]> {
    const dirKey = toKey(key);
    const absolute = toAbsolute(this.root, dirKey);
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
      if (isTempFile(dirent.name)) continue;
      const childKey = joinKey(dirKey, dirent.name);
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

    return sortEntries(entries);
  }

  async stat(key: string): Promise<OsStat | null> {
    let stat: Stats;
    try {
      stat = await fs.stat(toAbsolute(this.root, key));
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
    const fileKey = toKey(key);
    const absolute = toAbsolute(this.root, fileKey);
    let stat: Stats;
    try {
      stat = await fs.stat(absolute);
    } catch (err) {
      throw translate(err, fileKey, 'file');
    }
    if (stat.isDirectory()) throw RpcError.wrongKind(fileKey, 'file');

    const limit = this.settings.maxFileMb * 1024 * 1024;
    const truncated = stat.size > limit;
    let text: string;
    if (truncated) {
      const handle = await fs.open(absolute, 'r');
      try {
        const buffer = Buffer.allocUnsafe(limit);
        const { bytesRead } = await handle.read(buffer, 0, limit, 0);
        text = buffer.subarray(0, bytesRead).toString('utf8');
      } finally {
        await handle.close();
      }
    } else {
      text = await fs.readFile(absolute, 'utf8');
    }

    return { path: fileKey, text, revision: revisionOf(stat), truncated };
  }

  async write(
    key: string,
    text: string,
    expectedRevision?: string | null,
  ): Promise<{ path: string; revision: string }> {
    const fileKey = toKey(key);
    const absolute = toAbsolute(this.root, fileKey);

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
          `Файл изменился на диске: ${fileKey}`,
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

  async create(key: string, kind: 'file' | 'dir'): Promise<DirEntry> {
    const fileKey = toKey(key);
    const absolute = toAbsolute(this.root, fileKey);
    if (await exists(absolute)) throw RpcError.invalidParams(`Уже есть: ${fileKey}`);

    if (kind === 'dir') {
      await fs.mkdir(absolute, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, '', { encoding: 'utf8', flag: 'wx' });
    }
    return this.describe(fileKey);
  }

  async move(from: string, to: string): Promise<DirEntry> {
    const fromKey = toKey(from);
    const toKey_ = toKey(to);
    const source = toAbsolute(this.root, fromKey);
    const target = toAbsolute(this.root, toKey_);
    if (!(await exists(source))) throw RpcError.notFound(fromKey);
    if (source !== target && (await exists(target))) {
      throw RpcError.invalidParams(`Уже есть: ${toKey_}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(source, target);
    return this.describe(toKey_);
  }

  async copy(from: string, to: string): Promise<DirEntry> {
    const fromKey = toKey(from);
    const toKey_ = toKey(to);
    const source = toAbsolute(this.root, fromKey);
    const target = toAbsolute(this.root, toKey_);
    if (!(await exists(source))) throw RpcError.notFound(fromKey);
    if (await exists(target)) throw RpcError.invalidParams(`Уже есть: ${toKey_}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false });
    return this.describe(toKey_);
  }

  async remove(key: string): Promise<void> {
    const fileKey = toKey(key);
    if (fileKey === '') throw RpcError.invalidParams('Нельзя удалить корень проекта');
    const absolute = toAbsolute(this.root, fileKey);
    if (!(await exists(absolute))) throw RpcError.notFound(fileKey);
    await fs.rm(absolute, { recursive: true, force: true });
  }

  async writeBytes(key: string, base64: string): Promise<DirEntry> {
    const fileKey = toKey(key);
    const absolute = toAbsolute(this.root, fileKey);
    if (await exists(absolute)) throw RpcError.invalidParams(`Уже есть: ${fileKey}`);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, Buffer.from(base64, 'base64'));
    return this.describe(fileKey);
  }

  private async describe(key: string): Promise<DirEntry> {
    const absolute = toAbsolute(this.root, key);
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

export const TEMP_FILE = /(^\.#)|(~$)|(\.sw[px]$)|(^\..*\.tmp-\d+-)/;

export function isTempFile(name: string): boolean {
  return TEMP_FILE.test(name);
}

export function sortEntries(entries: DirEntry[]): DirEntry[] {
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
  });
}

function translate(err: unknown, key: string, expected: 'file' | 'dir'): RpcError {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return RpcError.notFound(key);
  if (code === 'ENOTDIR') return RpcError.wrongKind(key, expected);
  if (code === 'EACCES' || code === 'EPERM') {
    return new RpcError(RpcErrorCode.NotFound, `Нет доступа: ${key}`);
  }
  return new RpcError(RpcErrorCode.Internal, String(err));
}
