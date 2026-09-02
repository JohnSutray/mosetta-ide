import { journal } from '../log.js';

const log = journal.logger('shell-env');

export interface Harvester {
  (spec: {
    command: string;
    args: string[];
    cwd?: string;
    reason: string;
    timeoutMs?: number;
  }): Promise<{ ok: boolean; stdout: string; stderr: string; timedOut: boolean }>;
}

export interface Asked {
  file: string;
  args: string[];
}

const MARK = '__IDE_ENV_9f3a__';

const PROBE = `printf %s ${MARK}; env -0`;

const LOCAL = new Set(['PWD', 'OLDPWD', 'SHLVL', '_']);

export class ShellEnv {
  private harvested: Record<string, string> | null = null;
  private priming: Promise<void> | null = null;

  get current(): Record<string, string> | null {
    return this.harvested;
  }

  get path(): string | null {
    return this.harvested?.PATH ?? null;
  }

  prime(run: Harvester, shell: Asked, home: string): Promise<void> {
    if (this.priming) return this.priming;
    this.priming = this.harvest(run, shell, home).finally(() => {
      this.priming = null;
    });
    return this.priming;
  }

  forget(): void {
    this.harvested = null;
  }

  private async harvest(run: Harvester, shell: Asked, home: string): Promise<void> {
    if (process.platform === 'win32') return;

    const started = Date.now();
    const ran = await run({
      command: shell.file,
      args: [...shell.args, '-c', PROBE],
      cwd: home,
      reason: `окружение из ${shell.file}`,
      timeoutMs: 5000,
    });

    if (ran.timedOut) {
      log.warn(`${shell.file} не ответил за 5 с — работаю на окружении сервера`);
      return;
    }
    const at = ran.stdout.indexOf(MARK);
    if (!ran.ok || at === -1) {
      log.warn(
        `${shell.file} не отдал окружение (${ran.stderr.trim() || 'нет метки в ответе'}) — ` +
          'работаю на окружении сервера',
      );
      return;
    }

    const env = this.parse(ran.stdout.slice(at + MARK.length));
    if (Object.keys(env).length === 0) {
      log.warn(`${shell.file} отдал пустое окружение — работаю на окружении сервера`);
      return;
    }
    this.harvested = env;
    log.info(
      `окружение из ${shell.file}: ${Object.keys(env).length} переменных, ` +
        `${(env.PATH ?? '').split(':').length} путей за ${Date.now() - started} мс`,
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

export const shellEnv = new ShellEnv();
