import { journal } from '../log.js';

const log = journal.logger('shell-env');

/** Enough of the process runner that the collector does not have to import it. */
export interface Harvester {
  (spec: {
    command: string;
    args: string[];
    cwd?: string;
    reason: string;
    timeoutMs?: number;
  }): Promise<{ ok: boolean; stdout: string; stderr: string; timedOut: boolean }>;
}

/** The shell we ask: its file, and the arguments to launch it with. */
export interface Asked {
  file: string;
  args: string[];
}

/**
 * The marker the answer starts after.
 *
 * Mandatory: we are asking an INTERACTIVE shell (on this machine `nvm` is declared in
 * `.zshrc`, which only an interactive shell reads), and an interactive rc prints
 * banners to stdout — greetings, `fortune`, version manager hints. Without the marker
 * we would parse those as the environment.
 */
const MARK = '__IDE_ENV_9f3a__';

/** `env -0`: separated by a zero byte, because a value is entitled to contain a newline. */
const PROBE = `printf %s ${MARK}; env -0`;

/**
 * The probe's own variables rather than the user's.
 *
 * `PWD` is especially harmful: it would point at their home, whereas we run commands in
 * the project root, and a tool trusting `PWD` instead of `getcwd` would go looking for
 * files in the wrong place.
 */
const LOCAL = new Set(['PWD', 'OLDPWD', 'SHLVL', '_']);

export class ShellEnv {
  private harvested: Record<string, string> | null = null;
  private priming: Promise<void> | null = null;

  /** What was collected. `null` means not collected yet, or it did not work out. */
  get current(): Record<string, string> | null {
    return this.harvested;
  }

  /** The user's PATH. The tool lookup asks for it. */
  get path(): string | null {
    return this.harvested?.PATH ?? null;
  }

  /**
   * Ask the CHOSEN shell for its environment and remember it.
   *
   * It runs in the background and holds nobody up: until it answers, launches work on
   * the server's environment. A repeated call during the same collection simply waits
   * for the first one.
   *
   * We ask IN THE HOME directory rather than in the project root: home is neutral
   * ground. Otherwise a `direnv` that happened to sit in the directory the server was
   * started from would silently travel into EVERY project at once.
   */
  prime(run: Harvester, shell: Asked, home: string): Promise<void> {
    if (this.priming) return this.priming;
    this.priming = this.harvest(run, shell, home).finally(() => {
      this.priming = null;
    });
    return this.priming;
  }

  /** Forget what was collected. */
  forget(): void {
    this.harvested = null;
  }

  /**
   * The user's login shell — the one that sets up their PATH.
   *
   * Not the one they chose for our terminal: that is the terminal plugin's business,
   * whereas the core needs the environment for EVERY launch. Login and interactive:
   * without `-l` there is no PATH from the profile, without `-i` there is no `.zshrc`,
   * and `nvm` is declared in precisely that one.
   */
  loginShell(): Asked {
    const file = process.env.SHELL ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    return { file, args: ['-l', '-i'] };
  }

  private async harvest(run: Harvester, shell: Asked, home: string): Promise<void> {
    if (process.platform === 'win32') return;

    const started = Date.now();
    const ran = await run({
      command: shell.file,
      args: [...shell.args, '-c', PROBE],
      cwd: home,
      reason: `environment from ${shell.file}`,
      timeoutMs: 5000,
    });

    if (ran.timedOut) {
      log.warn(`${shell.file} did not answer within 5 s — running on the server's environment`);
      return;
    }
    const at = ran.stdout.indexOf(MARK);
    if (!ran.ok || at === -1) {
      log.warn(
        `${shell.file} gave no environment (${ran.stderr.trim() || 'no marker in the answer'}) — ` +
          'running on the server\'s environment',
      );
      return;
    }

    const env = this.parse(ran.stdout.slice(at + MARK.length));
    if (Object.keys(env).length === 0) {
      log.warn(`${shell.file} gave an empty environment — running on the server's environment`);
      return;
    }
    this.harvested = env;
    log.info(
      `environment from ${shell.file}: ${Object.keys(env).length} variables, ` +
        `${(env.PATH ?? '').split(':').length} paths in ${Date.now() - started} ms`,
    );
  }

  private parse(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const pair of raw.split('\0')) {
      const at = pair.indexOf('=');
      if (at <= 0) continue;
      const name = pair.slice(0, at);
      if (LOCAL.has(name)) continue;
      out[name] = pair.slice(at + 1);
    }
    return out;
  }
}
