import fs from 'node:fs';
import path from 'node:path';

/**
 * What to append to a name while searching.
 *
 * On Windows executability is decided by the extension rather than by a bit, so we walk
 * PATHEXT. But if an extension is ALREADY named (`powershell.exe`, `cmd.exe`), we try
 * the name as it is first — otherwise we would be looking for `powershell.exe.EXE` and
 * finding nothing. The system's own `where` behaves the same way.
 *
 * The empty suffix is added only in that case. Adding it to everything is not on: on
 * Windows a `pnpm` often sits next to `pnpm.CMD` — a POSIX shim for Git Bash that
 * `CreateProcess` cannot launch — and the package manager search would start finding
 * precisely that one.
 */
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
  /** The user's environment: their PATH, or `null` until the shell has answered. */
  constructor(private readonly env: { readonly path: string | null }) {}

  /** Whether such a program exists in PATH. No launching — only files. */
  onPath(name: string): string | null {
    const search = this.env.path ?? process.env.PATH ?? '';
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
