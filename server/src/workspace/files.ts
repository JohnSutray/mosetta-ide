import fs from 'node:fs/promises';
import path from 'node:path';
import type { Stats } from 'node:fs';
import type { DirEntry, FileText, WriteResult } from '@ide/protocol';
import { RpcErrorCode } from '@ide/protocol';
import { RpcError } from '../errors.js';
import type { Workspace } from './workspace.js';

const MAX_READ_BYTES = 8 * 1024 * 1024;

export async function listDir(ws: Workspace, relative: string): Promise<DirEntry[]> {
  const absolute = ws.resolve(relative);
  let dirents;
  try {
    dirents = await fs.readdir(absolute, { withFileTypes: true });
  } catch (err) {
    throw translate(err, relative, 'dir');
  }

  const entries: DirEntry[] = [];
  for (const dirent of dirents) {
    const child = path.join(absolute, dirent.name);
    let stat: Stats;
    try {
      stat = await fs.stat(child);
    } catch {
      continue;
    }
    if (!stat.isDirectory() && !stat.isFile()) continue;
    entries.push({
      path: ws.relative(child),
      name: dirent.name,
      kind: stat.isDirectory() ? 'dir' : 'file',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      symlink: dirent.isSymbolicLink(),
    });
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
  });
  return entries;
}

export async function readFile(ws: Workspace, relative: string): Promise<FileText> {
  const absolute = ws.resolve(relative);
  let stat: Stats;
  try {
    stat = await fs.stat(absolute);
  } catch (err) {
    throw translate(err, relative, 'file');
  }
  if (stat.isDirectory()) throw RpcError.wrongKind(relative, 'file');

  const truncated = stat.size > MAX_READ_BYTES;
  let text: string;
  if (truncated) {
    const handle = await fs.open(absolute, 'r');
    try {
      const buffer = Buffer.allocUnsafe(MAX_READ_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, MAX_READ_BYTES, 0);
      text = buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } else {
    text = await fs.readFile(absolute, 'utf8');
  }

  return { path: ws.relative(absolute), text, revision: revisionOf(stat), truncated };
}

export async function writeFile(
  ws: Workspace,
  relative: string,
  text: string,
  expectedRevision?: string | null,
): Promise<WriteResult> {
  const absolute = ws.resolve(relative);

  let current: Stats | null = null;
  try {
    current = await fs.stat(absolute);
  } catch {
    current = null;
  }
  if (current?.isDirectory()) throw RpcError.wrongKind(relative, 'file');

  if (expectedRevision != null) {
    const actual = current ? revisionOf(current) : null;
    if (actual !== expectedRevision) {
      throw new RpcError(
        RpcErrorCode.RevisionConflict,
        `Файл изменился на диске: ${relative}`,
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
  return { path: ws.relative(absolute), revision: revisionOf(written) };
}

export function revisionOf(stat: Stats): string {
  return `${Math.round(stat.mtimeMs)}:${stat.size}`;
}

function translate(err: unknown, relative: string, expected: 'file' | 'dir'): RpcError {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return RpcError.notFound(relative);
  if (code === 'ENOTDIR') return RpcError.wrongKind(relative, expected);
  if (code === 'EACCES' || code === 'EPERM') {
    return new RpcError(RpcErrorCode.NotFound, `Нет доступа: ${relative}`);
  }
  return new RpcError(RpcErrorCode.Internal, String(err));
}
