import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '@mosetta/ide-api/server';
import type { LspServerSettings, LspSettings } from './settings.js';

type InitOptions = Record<string, unknown> | undefined;

function resolveTsserver(root: string, dir: string, log: Logger): string | null {
  const local = path.join(root, 'node_modules', 'typescript', 'lib', 'tsserver.js');
  if (existsSync(local)) {
    log.debug(`typescript: беру проектный ${local}`);
    return local;
  }
  try {
    const own = createRequire(path.join(dir, 'noop.js')).resolve('typescript/lib/tsserver.js');
    log.info('typescript: в проекте своего нет, беру привезённый с редактором');
    return own;
  } catch {
    log.warn('typescript: не нашёл tsserver ни в проекте, ни у себя');
    return null;
  }
}

function resolveLanguageServer(root: string, dir: string, log: Logger): string | null {
  const local = path.join(root, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs');
  if (existsSync(local)) {
    log.debug(`typescript: беру проектный ${local}`);
    return local;
  }
  try {
    const own = createRequire(path.join(dir, 'noop.js')).resolve('typescript-language-server/lib/cli.mjs');
    log.info('typescript: беру языковой сервер, привезённый с редактором');
    return own;
  } catch {
    log.warn('typescript: не нашёл языковой сервер ни в проекте, ни у себя');
    return null;
  }
}

export interface Launch {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class Toolchain {
  constructor(private readonly dir: string) {}

  launchFor(name: string, settings: LspServerSettings, root: string, log: Logger): Launch | null {
    if (settings.command.trim() !== '') {
      return { command: settings.command, args: settings.args };
    }
    if (name !== 'typescript') {
      log.warn(`${name}: команда не указана, а привезённого сервера для него нет`);
      return null;
    }
    const cli = resolveLanguageServer(root, this.dir, log);
    if (!cli) return null;
    return {
      command: process.execPath,
      args: [cli, ...settings.args],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  preferencesFor(lsp: LspSettings, name: string): Record<string, unknown> {
    return { ...(lsp.servers[name]?.preferences ?? {}) };
  }

  optionsFor(name: string, root: string, log: Logger, preferences: Record<string, unknown> = {}): InitOptions {
    if (name !== 'typescript') return undefined;

    const tsserver = resolveTsserver(root, this.dir, log);
    return {
      ...(tsserver ? { tsserver: { path: tsserver } } : {}),
      preferences: {
        includeCompletionsForModuleExports: true,
        includeInlayParameterNameHints: 'none',
        ...preferences,
      },
    };
  }
}
