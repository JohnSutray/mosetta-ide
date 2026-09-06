import fs from 'node:fs';
import path from 'node:path';
import { shellEnv } from './shell-env.js';

function suffixesFor(name: string): string[] {
  if (process.platform !== 'win32') return [''];
  const exts = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((ext) => ext.trim().toLowerCase())
    .filter((ext) => ext !== '');
  const named = exts.includes(path.extname(name).toLowerCase());
  return named ? ['', ...exts] : exts;
}

function exists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export class Which {
  onPath(name: string): string | null {
    const search = shellEnv.path ?? process.env.PATH ?? '';
    const dirs = search.split(path.delimiter).filter((dir) => dir !== '');
    for (const dir of dirs) {
      for (const suffix of suffixesFor(name)) {
        const full = path.join(dir, name + suffix);
        if (exists(full)) return full;
      }
    }
    return null;
  }
}

export const which = new Which();
