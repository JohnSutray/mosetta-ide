#!/usr/bin/env node
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
if (split === -1) {
  console.error('with-env: a `--` is needed between the variables and the command');
  process.exit(2);
}

const env = { ...process.env };
for (const pair of argv.slice(0, split)) {
  const at = pair.indexOf('=');
  if (at <= 0) {
    console.error(`with-env: «${pair}» does not look like KEY=VALUE`);
    process.exit(2);
  }
  env[pair.slice(0, at)] = pair.slice(at + 1);
}

const [command, ...args] = argv.slice(split + 1);
if (!command) {
  console.error('with-env: no command left after the `--`');
  process.exit(2);
}

const windows = process.platform === 'win32';
const quote = (part) =>
  part === '' ? '""' : /[\s"&|<>^()]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part;

const child = spawn(windows ? quote(command) : command, windows ? args.map(quote) : args, {
  stdio: 'inherit',
  env,
  shell: windows,
});

child.on('error', (err) => {
  console.error(`with-env: could not start ${command}: ${err.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
