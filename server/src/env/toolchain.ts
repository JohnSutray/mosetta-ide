import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '../log.js';

type InitOptions = Record<string, unknown> | undefined;

export function initOptionsFor(name: string, root: string, log: Logger): InitOptions {
  if (name !== 'typescript') return undefined;

  const tsserver = resolveTsserver(root, log);
  return {
    ...(tsserver ? { tsserver: { path: tsserver } } : {}),
    preferences: {
      includeCompletionsForModuleExports: true,
      includeInlayParameterNameHints: 'none',
    },
  };
}

function resolveTsserver(root: string, log: Logger): string | null {
  const local = path.join(root, 'node_modules', 'typescript', 'lib', 'tsserver.js');
  if (existsSync(local)) {
    log.debug(`typescript: беру проектный ${local}`);
    return local;
  }
  try {
    const own = createRequire(import.meta.url).resolve('typescript/lib/tsserver.js');
    log.info('typescript: в проекте своего нет, беру привезённый с редактором');
    return own;
  } catch {
    log.warn('typescript: не нашёл tsserver ни в проекте, ни у себя');
    return null;
  }
}
