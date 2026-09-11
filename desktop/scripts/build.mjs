import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';

export class DeviceBuild {
  constructor(pkg) {
    this.pkg = pkg;
    this.out = path.join(pkg, '.build');
    this.require = createRequire(path.join(pkg, 'package.json'));
  }

  findPackage(name, from = this.pkg) {
    for (let dir = from; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
      if (path.dirname(dir) === dir) throw new Error(`не нашёл пакет ${name}, искал от ${from}`);
    }
  }

  packageDir(name) {
    return this.findPackage(name);
  }

  electron() {
    return this.require('electron');
  }

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
