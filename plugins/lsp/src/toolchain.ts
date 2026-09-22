import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '@mosetta/ide-api/server';
import type { LspServerSettings, LspSettings } from './settings.js';

/**
 * Where a language's tools lie on this machine.
 *
 * The language-specific parts live here rather than in the server class: the server
 * itself has to stay indifferent to the language, otherwise the next one (eslint,
 * rust-analyzer) starts growing `if (name === 'typescript')`. The project's contents
 * are not read from here: only "is there a file".
 */

type InitOptions = Record<string, unknown> | undefined;

/**
 * Which TypeScript to use.
 *
 * The project's own takes priority — the language's version is part of the project, and
 * a monorepo on TS 5.2 must not be checked by our 5.9. If it has none (a fresh clone
 * with no install, somebody else's repository, a directory with a couple of scripts),
 * we take the one that came with the editor: a language server that silently failed to
 * come up for want of a dependency is the worst of all possible outcomes.
 */
function resolveTsserver(root: string, dir: string, log: Logger): string | null {
  const local = path.join(root, 'node_modules', 'typescript', 'lib', 'tsserver.js');
  if (existsSync(local)) {
    log.debug(`typescript: taking the project's ${local}`);
    return local;
  }
  try {
    const own = createRequire(path.join(dir, 'noop.js')).resolve('typescript/lib/tsserver.js');
    log.info('typescript: the project has none of its own, taking the one that came with the editor');
    return own;
  } catch {
    log.warn('typescript: found tsserver neither in the project nor in ourselves');
    return null;
  }
}

/**
 * What to LAUNCH the language server with.
 *
 * By the same device as resolving TypeScript a floor below, and for the same reason
 * recorded there: a language server that silently failed to come up for want of a
 * dependency is the worst of all possible outcomes. The device used to be applied only
 * to `tsserver.js`, while the language server itself stayed a bare name in PATH — that
 * is, it rested on the user having installed it by hand. On a fresh machine they had
 * not, of course, and the IDE opened a project without a single type check.
 *
 * The project's own takes priority — by the same reasoning as with TypeScript: a tool's
 * version is part of the project.
 *
 * What comes back is the PATH TO THE SCRIPT rather than a name: the package hands over
 * `lib/cli.mjs`, and it has to be run by the same Node we live in.
 */
function resolveLanguageServer(root: string, dir: string, log: Logger): string | null {
  const local = path.join(root, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs');
  if (existsSync(local)) {
    log.debug(`typescript: taking the project's ${local}`);
    return local;
  }
  try {
    const own = createRequire(path.join(dir, 'noop.js')).resolve('typescript-language-server/lib/cli.mjs');
    log.info('typescript: taking the language server that came with the editor');
    return own;
  } catch {
    log.warn('typescript: found the language server neither in the project nor in ourselves');
    return null;
  }
}

/** What to launch the server with and how: ready to be handed to `project.start`. */
export interface Launch {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class Toolchain {
  /**
   * `dir` is the plugin package's directory: the TypeScript that came with us lies
   * beside it.
   */
  constructor(private readonly dir: string) {}

  /**
   * What to turn `command` from the settings into.
   *
   * An empty string means "the one that came with the editor" — just as an empty
   * `terminal.shell` means "as the system decides" and an empty `terminal.fontFamily`
   * means "as the editor's". A command the user named we do not touch at all: they
   * named it deliberately, and we have no right to substitute our own guess for it.
   *
   * We launch it with THE SAME executable we run in (`process.execPath`), and that is
   * not pedantry: under Electron the daemon lives inside Electron itself with
   * `ELECTRON_RUN_AS_NODE=1`, and there may be no second Node on the machine at all. We
   * pass that variable here too — otherwise the same file would start as an application
   * and open a window.
   */
  launchFor(name: string, settings: LspServerSettings, root: string, log: Logger): Launch | null {
    if (settings.command.trim() !== '') {
      return { command: settings.command, args: settings.args };
    }
    if (name !== 'typescript') {
      log.warn(`${name}: no command was given, and there is no bundled server for it`);
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

  /**
   * The server's settings for this project: the factory ones are ours, the rest come
   * from `servers.<name>.preferences`.
   *
   * There is no "by the project directory's name" layer any more: a project value now
   * lies inside the project itself (`.mosetta/settings.json`) and arrives here already
   * merged. A directory's name as a key was a lie anyway, because two projects with the
   * same name on one machine only fail to exist in theory.
   */
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
