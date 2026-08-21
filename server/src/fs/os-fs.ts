import fs from 'node:fs/promises';
import path from 'node:path';
import type { Stats } from 'node:fs';
import type { DirEntry, FsSettings } from '@ide/protocol';
import { RpcErrorCode } from '@ide/protocol';
import { RpcError } from '../errors.js';
import { expandRoot, joinKey, toAbsolute, toKey } from '../workspace/paths.js';

export interface OsEvent {
  type: 'wrote' | 'removed';
  path: string;
  revision?: string;
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

  async stat(key: string): Promise<Stats | null> {
    try {
      return await fs.stat(toAbsolute(this.root, key));
    } catch {
      return null;
    }
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

  static revision(stat: Stats): string {
    return revisionOf(stat);
  }

  private emit(event: OsEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function revisionOf(stat: Stats): string {
  return `${Math.round(stat.mtimeMs)}:${stat.size}`;
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
