import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '@ide/api/server';

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

export class Toolchain {
  constructor(private readonly dir: string) {}

  optionsFor(name: string, root: string, log: Logger): InitOptions {
    if (name !== 'typescript') return undefined;

    const tsserver = resolveTsserver(root, this.dir, log);
    return {
      ...(tsserver ? { tsserver: { path: tsserver } } : {}),
      preferences: {
        includeCompletionsForModuleExports: true,
        includeInlayParameterNameHints: 'none',
      },
    };
  }
}
