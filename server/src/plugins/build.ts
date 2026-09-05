import { build } from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { SharedModules, Side } from './shared.js';

export interface BuiltPlugin {
  code: string;
  exports: string[];
  ms: number;
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class PluginBuild {
  constructor(private readonly shared: SharedModules) {}

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
      plugins: [
        {
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
    if (!file) throw new Error('сборка не дала файла');
    const out = Object.values(result.metafile?.outputs ?? {})[0];
    return { code: file.text, exports: out?.exports ?? [], ms: Date.now() - started };
  }
}
