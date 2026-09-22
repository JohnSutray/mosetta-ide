import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';

/**
 * Build the IDE on this machine.
 *
 * There is no built code in the package, deliberately: the IDE is built where it
 * is going to live. Two steps: the client (vite) and Electron's main process (esbuild).
 * The server runs from sources, and it builds the plugins itself. Packages are looked
 * up by name: in the repository they are neighbours in a directory, in an installation
 * neighbours in `node_modules`.
 */
export class DeviceBuild {
  constructor(pkg) {
    this.pkg = pkg;
    this.out = path.join(pkg, '.build');
    this.require = createRequire(path.join(pkg, 'package.json'));
  }

  /**
   * The directory of a package visible from `from`: by searching upwards through
   * `node_modules`, as Node does, but past `exports` — the plugins do not hand
   * `./package.json` outwards, and `require.resolve` on it throws. pnpm's links are
   * expanded into the real path: its own dependencies are looked for from there.
   */
  findPackage(name, from = this.pkg) {
    for (let dir = from; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
      if (path.dirname(dir) === dir) throw new Error(`could not find the package ${name}, looked from ${from}`);
    }
  }

  packageDir(name) {
    return this.findPackage(name);
  }

  /**
   * Electron's binary. The `electron` package downloads it lazily, on the first
   * `require` — we make that an explicit build step rather than a surprise in the
   * middle of making a shortcut.
   */
  electron() {
    return this.require('electron');
  }

  /**
   * The execute bit on `node-pty`'s `spawn-helper`: both pnpm and npm unpack it without
   * one, and then `posix_spawnp` throws and the terminal does not open at all. We mend
   * it where the IDE is built — on every machine.
   */
  nativeHelpers() {
    const server = this.findPackage('@mosetta/ide-server');
    const terminal = this.findPackage('@mosetta/ide-plugin-terminal', server);
    const pty = this.findPackage('node-pty', terminal);
    const prebuilds = path.join(pty, 'prebuilds');
    if (!fs.existsSync(prebuilds)) return;
    for (const platform of fs.readdirSync(prebuilds)) {
      const helper = path.join(prebuilds, platform, 'spawn-helper');
      if (!fs.existsSync(helper)) continue;
      fs.chmodSync(helper, fs.statSync(helper).mode | 0o755);
    }
  }

  /**
   * The client into `.build/client`: the daemon's port will arrive in the page's
   * address.
   */
  async client() {
    const root = this.packageDir('@mosetta/ide-client');
    process.env.VITE_IDE_PORT = 'url';
    const { build } = await import('vite');
    await build({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      logLevel: 'warn',
      build: { outDir: path.join(this.out, 'client'), emptyOutDir: true },
    });
  }

  async main() {
    await bundle({
      entryPoints: [path.join(this.pkg, 'src', 'main.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      external: ['electron'],
      outfile: path.join(this.out, 'main.cjs'),
      logLevel: 'warning',
    });
  }

  async all() {
    this.electron();
    this.nativeHelpers();
    await this.client();
    await this.main();
  }
}

export const deviceBuild = new DeviceBuild(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await deviceBuild.all();
