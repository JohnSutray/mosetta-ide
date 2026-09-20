import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

/**
 * The packages the client holds and puts on the table with literal `import * as` (vite
 * demands literals). This is the one place obliged to agree with the client's own list,
 * and a test guards that. The reason is the same for each of them: a second copy is not
 * "slightly worse" but broken — preact's hooks and CodeMirror's state classes compare
 * identity.
 */
export const CORE_PROVIDED = [
  'preact',
  'preact/hooks',
  'preact/jsx-runtime',
  '@preact/signals',
  '@codemirror/state',
  '@codemirror/view',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/search',
  '@lezer/highlight',
  '@codemirror/lang-javascript',
  '@codemirror/lang-json',
  '@codemirror/lang-css',
  '@codemirror/lang-html',
  '@codemirror/lang-markdown',
  '@mosetta/ide-api/client',
] as const;

export type Side = 'client' | 'server';

/**
 * The contract's names, taken from its source.
 *
 * Half of `@mosetta/ide-api`'s exports are `declare`: there is no code behind them, and
 * the application supplies them through the table. esbuild throws those away, so the
 * only way to learn the names is to read the source.
 *
 * Only names DECLARED in the entry point count. The host's own plumbing lives in a module
 * of its own and arrives here as an `export *`, which this deliberately does not follow:
 * what a plugin may import and what the host uses are two different lists, and the
 * boundary between them is the module rather than a line of text. It used to be a
 * comment, and the first tidy-up of the comments took the plugin build down with it.
 */
export class ContractNames {
  /** Names with no code behind them: the application supplies those. */
  injected(text: string): string[] {
    return [...text.matchAll(/^export declare (?:function|const) (\w+)/gm)].map((m) => m[1]!);
  }

  /**
   * Names with real code in the part FOR PLUGINS: they go onto the table as they are.
   *
   * `const` too: the contract holds not only functions but CONSTANTS — settings layer
   * names, schemas. While there were none, the list quietly amounted to classes and
   * functions, and the first constant broke a plugin build with "Build failed with 2
   * errors" — without a hint as to which.
   */
  real(text: string): string[] {
    return [...text.matchAll(/^export (?:abstract class|function|const) (\w+)/gm)].map((m) => m[1]!);
  }

  /** Everything a plugin is entitled to import. */
  offered(text: string): string[] {
    return [...new Set([...this.injected(text), ...this.real(text)])];
  }
}

/**
 * What is on the table and what its exports are, for the side that reads it. The client
 * and the server are two different tables: a plugin has two halves with different
 * exports, and the contract has two entry points.
 */
export class SharedModules {
  private readonly exports = new Map<string, string[]>();
  readonly contract = new ContractNames();

  constructor(
    /** Where to look for packages: the directory whose `node_modules` holds them. */
    private readonly resolveFrom: string,
    /** The client's directory: it holds preact and CodeMirror, so we resolve from there. */
    private readonly clientDir: string,
  ) {}

  /** Whether this name is on this side's table. */
  knows(spec: string, side: Side): boolean {
    if (side === 'client' && (CORE_PROVIDED as readonly string[]).includes(spec)) return true;
    if (side === 'server' && spec === '@mosetta/ide-api/server') return true;
    return this.exports.has(`${side}:${spec}`);
  }

  /** The plugin is built — now it is known what it exports. */
  register(spec: string, side: Side, names: string[]): void {
    this.exports.set(`${side}:${spec}`, names);
  }

  /** Export names: from the table, from the contract, or from esbuild. */
  async exportsOf(spec: string, side: Side): Promise<string[]> {
    const known = this.exports.get(`${side}:${spec}`);
    if (known) return known;
    let names: string[];
    if (spec === '@mosetta/ide-api/client' || spec === '@mosetta/ide-api/server') {
      const file = spec.endsWith('client') ? 'client.ts' : 'server.ts';
      const text = await fs.readFile(path.join(await this.packageDir('@mosetta/ide-api'), 'src', file), 'utf8');
      names = this.contract.offered(text);
    } else {
      names = await this.probe(spec);
    }
    this.exports.set(`${side}:${spec}`, names);
    return names;
  }

  /**
   * A stub instead of an import: the same names, but from the table. An empty table is
   * not an `undefined` at render time but the name of whoever is missing: a package, or
   * a plugin that was not brought up.
   */
  async shim(spec: string, side: Side): Promise<string> {
    const names = await this.exportsOf(spec, side);
    const lines = names
      .filter((name) => name !== 'default')
      .map((name) => `export const ${name} = m[${JSON.stringify(name)}];`);
    if (names.includes('default')) lines.push('export default m.default;');
    return [
      `const m = globalThis.__ideApi.modules[${JSON.stringify(spec)}];`,
      `if (!m) throw new Error(${JSON.stringify(`${spec}: not up by load time — the package was not put on the shared table, or the plugin is off in settings.json`)});`,
      ...lines,
    ].join('\n');
  }

  /**
   * Where a package's `package.json` lies: upwards through `node_modules` from the
   * resolution root.
   */
  async manifestOf(name: string): Promise<string> {
    let dir = path.resolve(this.resolveFrom);
    for (;;) {
      const at = path.join(dir, 'node_modules', ...name.split('/'), 'package.json');
      try {
        await fs.access(at);
        return at;
      } catch {}
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
    throw new Error(`could not find the package ${name} next to ${this.resolveFrom}`);
  }

  private async packageDir(name: string): Promise<string> {
    return path.dirname(await this.manifestOf(name));
  }

  /**
   * A package's exports — somebody else's or our own — are asked of esbuild rather than
   * written out by hand. Cheaply at first: the package alone, neighbours external; if
   * it re-exports a neighbour with a star and the list came out empty, we build it
   * whole.
   */
  private async probe(spec: string): Promise<string[]> {
    const attempt = async (onlyThis: boolean) => {
      const result = await build({
        stdin: { contents: `export * from ${JSON.stringify(spec)};`, resolveDir: this.clientDir, loader: 'js' },
        absWorkingDir: this.clientDir,
        bundle: true,
        write: false,
        metafile: true,
        format: 'esm',
        platform: 'browser',
        logLevel: 'silent',
        plugins: onlyThis
          ? [
              {
                name: 'only-this',
                setup(api) {
                  api.onResolve({ filter: /^[^./]/ }, (args) =>
                    args.path === spec || args.path.startsWith(`${spec}/`) ? null : { path: args.path, external: true },
                  );
                },
              },
            ]
          : [],
      });
      const out = Object.values(result.metafile?.outputs ?? {})[0];
      return out?.exports ?? [];
    };
    const cheap = await attempt(true);
    return cheap.length > 0 ? cheap : attempt(false);
  }
}
