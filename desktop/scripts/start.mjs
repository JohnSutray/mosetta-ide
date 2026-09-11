import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const repo = path.resolve(desktop, '..');
const out = path.join(desktop, '.build');

const client = spawnSync(
  'pnpm',
  ['--filter', './client', 'exec', 'vite', 'build', '--outDir', path.join(out, 'client'), '--emptyOutDir'],
  { cwd: repo, stdio: 'inherit', env: { ...process.env, VITE_IDE_PORT: 'url' } },
);
if (client.status !== 0) process.exit(client.status ?? 1);

await build({
  entryPoints: [path.join(desktop, 'src', 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  outfile: path.join(out, 'main.cjs'),
  logLevel: 'warning',
});

const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, [path.join(out, 'main.cjs')], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
