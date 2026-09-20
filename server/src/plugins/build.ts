import { build } from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { SharedModules, Side } from './shared.js';

/**
 * Building a plugin on the human's machine.
 *
 * WHY WE BUILD IT OURSELVES. For one thing that cannot be guaranteed otherwise: shared
 * libraries have to exist in exactly ONE copy. If a plugin arrives already built, one
 * has to trust that its author marked the externals correctly; get that wrong and the
 * application holds two copies of Preact (hooks break silently) or two of
 * `@codemirror/state`, which CodeMirror 6 falls over on, because it compares class
 * identity. Building it ourselves, we decide rather than hope.
 *
 * The side benefit turned out to be no smaller: a plugin writes ordinary `import`
 * statements instead of taking everything as parameters. The `preact` in its code is
 * OUR preact, because that is how it was built. And a neighbouring plugin is an
 * ordinary `import` too: everything brought up once lies on the shared table, and the
 * stub reads from there.
 */

export interface BuiltPlugin {
  code: string;
  /** What the module exports: this is how neighbours learn what they may import. */
  exports: string[];
  /** How long it took: the build runs at install time, and its cost has to be visible. */
  ms: number;
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Building a plugin: TypeScript source, esbuild on the spot. */
export class PluginBuild {
  constructor(private readonly shared: SharedModules) {}

  /**
   * What the entry point depends on: the bare imports esbuild marked external. A quick
   * pass without stubs, just to learn the load order: a neighbour has to be on the
   * table before its import is resolved.
   */
  async imports(entry: string, side: Side): Promise<string[]> {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: side === 'client' ? 'browser' : 'node',
      packages: 'external',
      jsx: 'automatic',
      jsxImportSource: 'preact',
      logLevel: 'silent',
    });
    const out = new Set<string>();
    for (const input of Object.values(result.metafile?.inputs ?? {})) {
      for (const one of input.imports) if (one.external) out.add(one.path);
    }
    return [...out];
  }

  /**
   * Build one of a plugin's entry points into self-contained ESM.
   *
   * `side` changes only the target: in a browser it is the browser, on the server it is
   * Node. Everything else is identical on purpose — a plugin with two halves should be
   * built by one set of rules.
   */
  async entry(entry: string, side: Side): Promise<BuiltPlugin> {
    const started = Date.now();
    const shared = this.shared;
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: side === 'client' ? 'browser' : 'node',
      target: 'es2022',
      sourcemap: 'inline',
      sourceRoot: path.dirname(entry),
      jsx: 'automatic',
      jsxImportSource: 'preact',
      logLevel: 'silent',
      ...(side === 'server' ? { packages: 'external' as const } : {}),
      loader: { '.css': 'text' },
      plugins: [
        {
          /**
           * The server half's external packages, by ABSOLUTE path.
           *
           * The build output lies in the state directory, outside the project, and from
           * there an `import 'node-pty'` resolves to nothing at all: node looks for
           * `node_modules` upwards from the file, and upwards lies the user's home. So
           * we resolve HERE, from the plugin's own directory: its dependencies are its
           * own, and it is the one that should know about them, not us.
           */
          name: 'ide-externals',
          setup(api) {
            if (side !== 'server') return;
            api.onResolve({ filter: /^[^./]/ }, (args) => {
              if (args.kind === 'entry-point') return null;
              if (shared.knows(args.path, side)) return null;
              if (args.path.startsWith('node:')) return { path: args.path, external: true };
              try {
                const found = createRequire(path.join(path.dirname(entry), 'noop.js')).resolve(
                  args.path,
                );
                return { path: pathToFileURL(found).href, external: true };
              } catch {
                return { path: args.path, external: true };
              }
            });
          },
        },
        {
          /**
           * Everything on the table comes from the table. Whether it is a package or a
           * neighbouring plugin makes no difference: both were brought up once.
           */
          name: 'ide-shared',
          setup(api) {
            api.onResolve({ filter: /^[^./]/ }, (args) => {
              if (args.kind === 'entry-point') return null;
              if (!shared.knows(args.path, side)) return null;
              return { path: args.path, namespace: 'ide-shared' };
            });
            api.onLoad({ filter: /.*/, namespace: 'ide-shared' }, async (args) => ({
              contents: await shared.shim(args.path, side),
              loader: 'js',
            }));
          },
        },
        {
          /**
           * `import text from './file.css?raw'` — a file as a string. vitest
           * understands the same suffix, so a plugin has one import for both builds.
           * Here the suffix is only stripped, and the path resolved from the plugin's
           * directory; turning the file into text is the loader's job, by extension.
           * This is how the terminal carries `xterm.css` — it used to live in the core
           * and got lost when the terminal moved into a plugin.
           */
          name: 'ide-raw',
          setup(api) {
            api.onResolve({ filter: /\?raw$/ }, (args) => {
              const bare = args.path.slice(0, -'?raw'.length);
              const from = createRequire(path.join(args.resolveDir, 'noop.js'));
              const found = bare.startsWith('.') ? path.resolve(args.resolveDir, bare) : from.resolve(bare);
              return { path: found };
            });
          },
        },
        {
          name: 'ide-jsx',
          setup(api) {
            api.onResolve({ filter: new RegExp(`^${escape('preact/jsx-')}(dev-)?runtime$`) }, (args) => ({
              path: args.path,
              namespace: 'ide-jsx',
            }));
            api.onLoad({ filter: /.*/, namespace: 'ide-jsx' }, () => ({
              contents: `const r = globalThis.__ideApi.modules['preact/jsx-runtime'];
  export const jsx = r.jsx;
  export const jsxs = r.jsxs;
  export const jsxDEV = r.jsxDEV ?? r.jsx;
  export const Fragment = r.Fragment;`,
              loader: 'js',
            }));
          },
        },
      ],
    });

    const file = result.outputFiles?.[0];
    if (!file) throw new Error('the build produced no file');
    const out = Object.values(result.metafile?.outputs ?? {})[0];
    return { code: file.text, exports: out?.exports ?? [], ms: Date.now() - started };
  }
}
