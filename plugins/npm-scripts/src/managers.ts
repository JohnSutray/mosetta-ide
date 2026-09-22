import fs from 'node:fs';
import path from 'node:path';

/**
 * A package manager found on the machine, with an eye on the project: the lockfile says
 * what this project is meant to be run with.
 */
export interface PackageManagerInfo {
  /** What to call it by: `pnpm` from PATH, or a full path if one was written in by hand. */
  path: string;
  name: string;
  /** The version, if it could be asked for. Empty means not asked, or no answer. */
  version: string;
  /**
   * This is what the project decided: a lockfile, or the `packageManager` field in
   * `package.json`.
   */
  suggested: boolean;
  /** This is what the scripts are being run with right now. */
  current: boolean;
}

/** Who we look for at all. The order is the order they are shown in. */
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

  /**
   * What to run scripts with when the user has not chosen. Determined by the lockfile
   * — a fact about the project, so the presence of those files is passed in here rather
   * than worked out here.
   */
  suggested(has: (file: string) => boolean): string {
    if (has('pnpm-lock.yaml')) return 'pnpm';
    if (has('yarn.lock')) return 'yarn';
    if (has('bun.lockb')) return 'bun';
    return 'npm';
  }

  /**
   * What to run with: the user's choice beats the lockfile — that is what a setting is
   * for.
   */
  chosen(suggested: string, setting: string): string {
    const wanted = setting.trim();
    return wanted === '' ? suggested : wanted;
  }

  /**
   * What was found. `chosen` is the user's choice from the settings, `suggested` is
   * what the project suggests.
   */
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
