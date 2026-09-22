#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `npx @mosetta/ide [folder]`: the daemon and the interface on one port, and a browser
 * tab on the folder.
 *
 * The daemon runs from its TypeScript sources under tsx — the same way the desktop app
 * runs it — and serves the built client itself, so the page and its socket share an
 * origin and nothing needs configuring. Personal settings live where the desktop app
 * keeps them, `~/.mosetta/ide/config/settings.json`.
 */

const HELP = `Usage: mosetta-ide [folder] [options]

Opens the folder (the current one by default) in Mosetta IDE in your browser.

Options:
  --port <n>   the port to listen on (default: the first free one from 4177)
  --no-open    do not open the browser, only print the address
  --verbose    print the daemon's whole log
  -h, --help   show this
`;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  process.stdout.write(HELP);
  process.exit(0);
}

const flag = (name) => args.includes(name);
const value = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const folder = path.resolve(args.find((one, i) => !one.startsWith('-') && args[i - 1] !== '--port') ?? process.cwd());

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const require = createRequire(import.meta.url);
const serverDir = path.dirname(require.resolve('@mosetta/ide-server/package.json'));
const tsx = import.meta.resolve('tsx');

function free(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

async function pickPort() {
  const asked = value('--port');
  if (asked) {
    const port = Number(asked);
    if (!(await free(port))) throw new Error(`port ${port} is taken`);
    return port;
  }
  for (let port = 4177; port < 4277; port++) if (await free(port)) return port;
  throw new Error('no free port between 4177 and 4276');
}

function openBrowser(url) {
  const [command, ...rest] =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '""', url]
        : ['xdg-open', url];
  spawn(command, rest, { stdio: 'ignore', detached: true }).unref();
}

const port = await pickPort();
const url = `http://127.0.0.1:${port}/?ws=${encodeURIComponent(folder)}`;
const verbose = flag('--verbose');

const daemon = spawn(process.execPath, ['--import', tsx, path.join(serverDir, 'src', 'main.ts')], {
  cwd: serverDir,
  env: {
    ...process.env,
    IDE_PORT: String(port),
    IDE_STATIC_DIR: path.join(pkg, 'client'),
    IDE_CLIENT_DIR: pkg,
    IDE_CONFIG_DIR: process.env.IDE_CONFIG_DIR ?? path.join(os.homedir(), '.mosetta', 'ide', 'config'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let ready = false;
const relay = (chunk) => {
  for (const line of String(chunk).split('\n')) {
    if (line.trim() === '') continue;
    if (!ready && line.includes('listening on')) {
      ready = true;
      process.stdout.write(`\n  Mosetta IDE  ${url}\n\n  Ctrl+C stops it.\n\n`);
      if (!flag('--no-open')) openBrowser(url);
    }
    if (verbose || / (warn|error) /.test(line)) process.stderr.write(line + '\n');
  }
};
daemon.stdout.on('data', relay);
daemon.stderr.on('data', relay);
daemon.on('exit', (code) => {
  if (!ready) process.stderr.write('The daemon stopped before it started listening; run with --verbose to see why.\n');
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => daemon.kill('SIGTERM'));
