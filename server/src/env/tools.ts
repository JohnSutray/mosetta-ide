import fs from 'node:fs';
import path from 'node:path';
import type { PackageManagerInfo } from '@ide/protocol';

const KNOWN = ['pnpm', 'yarn', 'npm', 'bun'] as const;

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

export class Tools {
  packageManager(has: (file: string) => boolean): string {
    if (has('pnpm-lock.yaml')) return 'pnpm';
    if (has('yarn.lock')) return 'yarn';
    if (has('bun.lockb')) return 'bun';
    return 'npm';
  }

  detectPackageManagers(
    suggested: string,
    chosen: string,
    root: string,
  ): PackageManagerInfo[] {
    const wanted = chosen.trim();
    const effective = wanted === '' ? suggested : wanted;

    const out: PackageManagerInfo[] = [];
    const seen = new Set<string>();
    const add = (file: string, name: string) => {
      const key = file.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        path: file,
        name,
        version: '',
        suggested: name === suggested,
        current: file === effective || name === effective,
      });
    };

    for (const name of KNOWN) {
      const found = this.onPath(name);
      if (found) add(name, name);
      else if (name === suggested) {
        add(name, name);
      }
    }

    for (const name of KNOWN) {
      const local = path.join(root, 'node_modules', '.bin', name);
      if (exists(local)) add(local, name);
    }

    if (wanted !== '' && !out.some((item) => item.current)) {
      add(wanted, path.basename(wanted));
    }
    return out;
  }

  onPath(name: string): string | null {
    const dirs = (process.env.PATH ?? '').split(path.delimiter).filter((dir) => dir !== '');
    for (const dir of dirs) {
      for (const suffix of suffixesFor(name)) {
        const full = path.join(dir, name + suffix);
        if (exists(full)) return full;
      }
    }
    return null;
  }
}

export const tools = new Tools();
