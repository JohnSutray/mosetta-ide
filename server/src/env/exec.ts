import path from 'node:path';
import type { Which } from './which.js';

/**
 * HOW to launch a tool on this machine.
 *
 * The `env/` axis already answers "where does it live". This is the neighbouring,
 * equally machine-specific question: a file that has been found still has to be
 * LAUNCHABLE, and on Windows that is a story of its own, with two different failures.
 *
 * The first: `spawn('typescript-language-server')` fails with ENOENT. Windows knows
 * nothing about PATHEXT inside `CreateProcess` — a name without an extension is not a
 * file to it. On a Mac the same line works, because there executability is a bit rather
 * than an extension.
 *
 * The second: handing it the `.cmd` that was found, by full path, does not work either
 * — since Node 20 that is a synchronous EINVAL. This is how CVE-2024-27980 was closed:
 * npm's package shims on Windows are batch files, a batch file parses its own command
 * line, and an argument containing `&` turned into somebody else's command.
 *
 * What remains is to hand name resolution to whoever knows everything about PATHEXT and
 * batch files — `cmd.exe` itself (`shell: true`). The price is honest: since the shell
 * now reads the line, we place the quotes ourselves, otherwise the first `C:\Program
 * Files\…` arrives as two arguments.
 */

export interface LaunchPlan {
  command: string;
  args: string[];
  /** Whether to hand the line to a shell. Always `false` off Windows. */
  shell: boolean;
}

/** The extensions Windows can only launch through a shell. */
const BATCH = new Set(['.cmd', '.bat']);

/**
 * Quoting for `cmd.exe`. With `shell: true` Node glues the command and its arguments
 * together with spaces AS THEY ARE — without this, a path containing a space falls
 * apart.
 */
function quote(part: string): string {
  if (part === '') return '""';
  if (!/[\s"&|<>^()]/.test(part)) return part;
  return `"${part.replace(/"/g, '\\"')}"`;
}

/** How to launch a command on this system. */
export class Exec {
  /**
   * Where the command lives on this machine — from our own `Which` rather than a
   * module-level one.
   */
  constructor(private readonly which: Pick<Which, 'onPath'>) {}

  /**
   * What to turn `command` plus `args` from the settings into so that `spawn` starts.
   *
   * Off Windows this is the identity: there `spawn` walks PATH itself, and a shell in
   * the middle would only get in the way (an extra process, somebody else's signal
   * handling).
   */
  plan(command: string, args: string[]): LaunchPlan {
    if (process.platform !== 'win32') return { command, args, shell: false };

    const resolved = path.isAbsolute(command) ? command : this.which.onPath(command);
    if (resolved && !BATCH.has(path.extname(resolved).toLowerCase())) {
      return { command: resolved, args, shell: false };
    }

    return { command: quote(command), args: args.map(quote), shell: true };
  }
}
