import { describe, expect, it } from 'vitest';
import { ShellEnv, type Harvester } from '../src/env/shell-env.js';
import { Processes } from '../src/env/processes.js';
import { Exec } from '../src/env/exec.js';
import { Which } from '../src/env/which.js';

/**
 * A launch plan without the user's PATH: the `env/` axis's connections arrive as
 * arguments.
 */
const plan = () => new Exec(new Which({ path: null }));

/** A decoy shell: it prints what it was told to and ignores `-c`. */
function fakeShell(stdout: string, ok = true): Harvester {
  return async () => ({ ok, stdout, stderr: ok ? '' : 'the shell refused', timedOut: false });
}

const MARK = '__IDE_ENV_9f3a__';

describe('the user\'s environment', () => {
  it('parses a real shell\'s answer', async () => {
    if (process.platform === 'win32') return;
    const env = new ShellEnv();
    const processes = new Processes({ current: null }, plan());
    await env.prime((spec) => processes.run(spec), { file: '/bin/sh', args: [] }, process.cwd());

    expect(env.current).not.toBe(null);
    expect(env.path).toContain('/');
    expect(Object.keys(env.current ?? {}).length).toBeGreaterThan(3);
  });

  it('cuts an interactive rc\'s banner off at the marker', async () => {
    const env = new ShellEnv();
    await env.prime(
      fakeShell(`Welcome!\nfortune: have another one of these buns\n${MARK}PATH=/mine/bin\0HOME=/home\0`),
      { file: '/bin/zsh', args: ['-l', '-i'] },
      '/home',
    );
    expect(env.current).toEqual({ PATH: '/mine/bin', HOME: '/home' });
    expect(env.path).toBe('/mine/bin');
  });

  it('a value with a newline in it arrives whole', async () => {
    const env = new ShellEnv();
    await env.prime(
      fakeShell(`${MARK}PATH=/bin\0GREETING=one\ntwo\0`),
      { file: '/bin/zsh', args: [] },
      '/home',
    );
    expect(env.current?.GREETING).toBe('one\ntwo');
  });

  it('the probe\'s own variables are thrown away', async () => {
    const env = new ShellEnv();
    await env.prime(
      fakeShell(`${MARK}PATH=/bin\0PWD=/home\0OLDPWD=/\0SHLVL=1\0_=/usr/bin/env\0`),
      { file: '/bin/zsh', args: [] },
      '/home',
    );
    expect(env.current).toEqual({ PATH: '/bin' });
  });

  it('a shell without the marker does not count as having answered', async () => {
    const env = new ShellEnv();
    await env.prime(fakeShell('I did not understand your command'), { file: '/bin/nu', args: [] }, '/home');
    expect(env.current).toBe(null);
    expect(env.path).toBe(null);
  });

  it('a shell\'s refusal does not assemble an empty environment', async () => {
    const env = new ShellEnv();
    await env.prime(fakeShell('', false), { file: '/bin/zsh', args: [] }, '/home');
    expect(env.current).toBe(null);
  });

  it('a shell that hangs neither holds us up nor assembles anything', async () => {
    const env = new ShellEnv();
    const hung: Harvester = async () => ({ ok: false, stdout: '', stderr: '', timedOut: true });
    await env.prime(hung, { file: '/bin/zsh', args: [] }, '/home');
    expect(env.current).toBe(null);
  });

  it('two requests in a row assemble it once', async () => {
    let asked = 0;
    const counting: Harvester = async (spec) => {
      asked += 1;
      return fakeShell(`${MARK}PATH=/bin\0`)(spec);
    };
    const env = new ShellEnv();
    await Promise.all([
      env.prime(counting, { file: '/bin/zsh', args: [] }, '/home'),
      env.prime(counting, { file: '/bin/zsh', args: [] }, '/home'),
    ]);
    expect(asked).toBe(1);
  });

  it('changing the shell in the settings forgets what was assembled', async () => {
    const env = new ShellEnv();
    await env.prime(fakeShell(`${MARK}PATH=/old\0`), { file: '/bin/zsh', args: [] }, '/home');
    expect(env.path).toBe('/old');

    env.forget();
    expect(env.current).toBe(null);

    await env.prime(fakeShell(`${MARK}PATH=/new\0`), { file: '/bin/fish', args: [] }, '/home');
    expect(env.path).toBe('/new');
  });

  it('the probe goes HOME rather than where the server was started', async () => {
    let seen = '';
    const spy: Harvester = async (spec) => {
      seen = spec.cwd ?? '';
      return { ok: true, stdout: `${MARK}PATH=/bin\0`, stderr: '', timedOut: false };
    };
    const env = new ShellEnv();
    await env.prime(spy, { file: '/bin/zsh', args: ['-l', '-i'] }, '/home/of-the-human');
    expect(seen).toBe('/home/of-the-human');
  });

  it('we ask the CHOSEN shell with its own arguments', async () => {
    let asked: { file: string; args: string[] } = { file: '', args: [] };
    const spy: Harvester = async (spec) => {
      asked = { file: spec.command, args: spec.args };
      return { ok: true, stdout: `${MARK}PATH=/bin\0`, stderr: '', timedOut: false };
    };
    const env = new ShellEnv();
    await env.prime(spy, { file: '/opt/homebrew/bin/fish', args: ['-l', '-i'] }, '/home');

    expect(asked.file).toBe('/opt/homebrew/bin/fish');
    expect(asked.args.slice(0, 2)).toEqual(['-l', '-i']);
    expect(asked.args[2]).toBe('-c');
    expect(asked.args[3]).toContain('env -0');
  });
});

describe('the user\'s environment reaches a launch', () => {
  const node = process.execPath;
  const read = (name: string) => ['-e', `process.stdout.write(String(process.env.${name}))`];

  it('the "user-shell" intention mixes in what was assembled', async () => {
    const processes = new Processes({ current: { FOUND: 'from the shell' } }, plan());
    const ran = await processes.run({
      command: node,
      args: read('FOUND'),
      reason: 'a test',
      wants: ['user-shell'],
    });
    expect(ran.stdout).toBe('from the shell');
  });

  it('without the intention the server\'s environment is left untouched', async () => {
    const processes = new Processes({ current: { FOUND: 'from the shell' } }, plan());
    const ran = await processes.run({ command: node, args: read('FOUND'), reason: 'a test' });
    expect(ran.stdout).toBe('undefined');
  });

  it('until the shell has answered we run on the server\'s environment', async () => {
    const processes = new Processes({ current: null }, plan());
    const ran = await processes.run({
      command: node,
      args: read('PATH'),
      reason: 'a test',
      wants: ['user-shell'],
    });
    expect(ran.stdout).toBe(process.env.PATH);
  });

  it('a tool\'s own beats the user\'s environment', async () => {
    const processes = new Processes({ current: { FOUND: 'from the shell' } }, plan());
    const ran = await processes.run({
      command: node,
      args: read('FOUND'),
      reason: 'a test',
      wants: ['user-shell'],
      env: { FOUND: 'mine' },
    });
    expect(ran.stdout).toBe('mine');
  });
});
