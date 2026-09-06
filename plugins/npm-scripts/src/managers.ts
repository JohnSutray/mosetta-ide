import fs from 'node:fs';
import path from 'node:path';

export interface PackageManagerInfo {
  path: string;
  name: string;
  version: string;
  suggested: boolean;
  current: boolean;
}

const KNOWN = ['pnpm', 'yarn', 'npm', 'bun'] as const;

function exists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export class PackageManagers {
  constructor(private readonly which: (name: string) => string | null) {}

  suggested(has: (file: string) => boolean): string {
    if (has('pnpm-lock.yaml')) return 'pnpm';
    if (has('yarn.lock')) return 'yarn';
    if (has('bun.lockb')) return 'bun';
    return 'npm';
  }

  chosen(suggested: string, setting: string): string {
    const wanted = setting.trim();
    return wanted === '' ? suggested : wanted;
  }

  detect(suggested: string, chosen: string, root: string): PackageManagerInfo[] {
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
      const found = this.which(name);
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
}
