import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

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
  '@ide/api/client',
] as const;

export type Side = 'client' | 'server';

export class ContractNames {
  readonly hostMarker = '--- то, чем пользуется ХОСТ';

  injected(text: string): string[] {
    return [...text.matchAll(/^export declare (?:function|const) (\w+)/gm)].map((m) => m[1]!);
  }

  real(text: string): string[] {
    return [...this.forPlugins(text).matchAll(/^export (?:abstract class|function) (\w+)/gm)].map(
      (m) => m[1]!,
    );
  }

  offered(text: string): string[] {
    return [...new Set([...this.injected(text), ...this.real(text)])];
  }

  forPlugins(text: string): string {
    const at = text.indexOf(this.hostMarker);
    if (at < 0) throw new Error('в пакете нет черты «хостовое ниже»');
    return text.slice(0, at);
  }

  forHost(text: string): string {
    return text.slice(text.indexOf(this.hostMarker));
  }
}

export class SharedModules {
  private readonly exports = new Map<string, string[]>();
  readonly contract = new ContractNames();

  constructor(
    private readonly resolveFrom: string,
    private readonly clientDir: string,
  ) {}

  knows(spec: string, side: Side): boolean {
    if (side === 'client' && (CORE_PROVIDED as readonly string[]).includes(spec)) return true;
    if (side === 'server' && spec === '@ide/api/server') return true;
    return this.exports.has(`${side}:${spec}`);
  }

  register(spec: string, side: Side, names: string[]): void {
    this.exports.set(`${side}:${spec}`, names);
  }

  async exportsOf(spec: string, side: Side): Promise<string[]> {
    const known = this.exports.get(`${side}:${spec}`);
    if (known) return known;
    let names: string[];
    if (spec === '@ide/api/client' || spec === '@ide/api/server') {
      const file = spec.endsWith('client') ? 'client.ts' : 'server.ts';
      const text = await fs.readFile(path.join(await this.packageDir('@ide/api'), 'src', file), 'utf8');
      names = this.contract.offered(text);
    } else {
      names = await this.probe(spec);
    }
    this.exports.set(`${side}:${spec}`, names);
    return names;
  }

  async shim(spec: string, side: Side): Promise<string> {
    const names = await this.exportsOf(spec, side);
    const lines = names
      .filter((name) => name !== 'default')
      .map((name) => `export const ${name} = m[${JSON.stringify(name)}];`);
    if (names.includes('default')) lines.push('export default m.default;');
    return [
      `const m = globalThis.__ideApi.modules[${JSON.stringify(spec)}];`,
      `if (!m) throw new Error(${JSON.stringify(`${spec}: не поднят к моменту загрузки — пакет не отдан на стол или плагин выключен в settings.json`)});`,
      ...lines,
    ].join('\n');
  }

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
    throw new Error(`не нашёл пакет ${name} рядом с ${this.resolveFrom}`);
  }

  private async packageDir(name: string): Promise<string> {
    return path.dirname(await this.manifestOf(name));
  }

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
