import path from 'node:path';
import os from 'node:os';
import { RpcError } from '../errors.js';

const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/;

/**
 * Paths live in two forms, and they must not be confused.
 *
 * * KEY — what travels over the wire and lies in memory: a path relative to the project root, the separator always `/`, the root the empty string.
 * * DISK — an absolute path in the OS's native separators.
 *
 * Turning a key into a disk path is the only door outwards, and it is here. It follows
 * that the front end and the memory layer know nothing about separators at all (they
 * are the same on a Mac and on Windows), and that escaping the root is checked in one
 * place.
 *
 * A class rather than a handful of functions: the door should have a name visible at
 * the call site — `paths.toAbsolute(root, key)` reads as "ask the paths".
 */
export class Paths {
  /**
   * Any protocol path to a canonical key. Absolute paths, drive letters, UNC paths and
   * NUL bytes are rejected: they cannot occur in the protocol, and if they arrived it
   * is either a front-end bug or not the front end.
   */
  toKey(input: string): string {
    if (typeof input !== 'string') throw RpcError.invalidParams('path must be a string');
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

  /** A key to a path on disk, checking that it is still inside the root. */
  toAbsolute(root: string, key: string): string {
    const clean = this.toKey(key);
    const absolute = clean === '' ? root : path.join(root, ...clean.split('/'));
    if (!this.isInside(root, absolute)) throw RpcError.pathEscape(key);
    return absolute;
  }

  /** A path on disk to a key. */
  toRelative(root: string, absolute: string): string {
    const rel = path.relative(root, absolute);
    if (rel === '') return '';
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw RpcError.pathEscape(absolute);
    return rel.split(path.sep).join('/');
  }

  /**
   * Joining keys: `join('src', 'a.ts')` → `src/a.ts`, and the root does not add a stray
   * slash.
   */
  joinKey(parent: string, name: string): string {
    return parent === '' ? name : `${parent}/${name}`;
  }

  /** The name of a key's last segment. */
  baseName(key: string): string {
    const at = key.lastIndexOf('/');
    return at === -1 ? key : key.slice(at + 1);
  }

  /** The extension without its dot, lower-cased. The empty string if there is none. */
  extensionOf(key: string): string {
    const name = this.baseName(key);
    const at = name.lastIndexOf('.');
    return at <= 0 ? '' : name.slice(at + 1).toLowerCase();
  }

  /**
   * The "is it inside" check: by segments rather than by string prefix — otherwise
   * `/proj-secret` would pass for a descendant of `/proj`.
   */
  isInside(root: string, candidate: string): boolean {
    if (candidate === root) return true;
    const withSep = root.endsWith(path.sep) ? root : root + path.sep;
    return candidate.startsWith(withSep);
  }

  /** `~/projects/x` to an absolute path. Needed only for `workspace.open`. */
  expandRoot(input: string): string {
    let value = input.trim();
    if (value === '') throw RpcError.invalidParams('root is empty');
    if (value === '~') value = os.homedir();
    else if (value.startsWith('~/') || value.startsWith('~\\')) {
      value = path.join(os.homedir(), value.slice(2));
    }
    return path.resolve(value);
  }
}

/** One per process: there is no state, but there is a name at the call site. */
export const paths = new Paths();
