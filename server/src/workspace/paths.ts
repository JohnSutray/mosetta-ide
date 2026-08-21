import path from 'node:path';
import os from 'node:os';
import { RpcError } from '../errors.js';

const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/;

export function toKey(input: string): string {
  if (typeof input !== 'string') throw RpcError.invalidParams('path должен быть строкой');
  if (input.includes('\0')) throw RpcError.pathEscape(input);
  if (input.startsWith('/') || input.startsWith('\\')) throw RpcError.pathEscape(input);
  if (WINDOWS_ABSOLUTE.test(input)) throw RpcError.pathEscape(input);

  const segments: string[] = [];
  for (const raw of input.split(/[\\/]+/)) {
    if (raw === '' || raw === '.') continue;
    if (raw === '..') {
      if (segments.length === 0) throw RpcError.pathEscape(input);
      segments.pop();
      continue;
    }
    segments.push(raw);
  }
  return segments.join('/');
}

export function toAbsolute(root: string, key: string): string {
  const clean = toKey(key);
  const absolute = clean === '' ? root : path.join(root, ...clean.split('/'));
  if (!isInside(root, absolute)) throw RpcError.pathEscape(key);
  return absolute;
}

export function toRelative(root: string, absolute: string): string {
  const rel = path.relative(root, absolute);
  if (rel === '') return '';
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw RpcError.pathEscape(absolute);
  return rel.split(path.sep).join('/');
}

export function joinKey(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`;
}

export function baseName(key: string): string {
  const at = key.lastIndexOf('/');
  return at === -1 ? key : key.slice(at + 1);
}

export function extensionOf(key: string): string {
  const name = baseName(key);
  const at = name.lastIndexOf('.');
  return at <= 0 ? '' : name.slice(at + 1).toLowerCase();
}

export function isInside(root: string, candidate: string): boolean {
  if (candidate === root) return true;
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate.startsWith(withSep);
}

export function expandRoot(input: string): string {
  let value = input.trim();
  if (value === '') throw RpcError.invalidParams('root пустой');
  if (value === '~') value = os.homedir();
  else if (value.startsWith('~/') || value.startsWith('~\\')) {
    value = path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}
