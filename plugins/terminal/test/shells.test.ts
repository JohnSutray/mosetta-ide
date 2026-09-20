import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Shells } from '../src/shells.js';

/**
 * What to launch terminals with.
 *
 * We check what is settled by arithmetic rather than by which shells happen to be on
 * the checker's machine: we put our own shell in our own directory and add it to PATH
 * ourselves. Otherwise the test would be checking different things on a Mac and on
 * Windows.
 *
 * There is one main promise here: **what is written into the config has to read back to
 * the same file on the machine where it was written, and must not break a machine that
 * has no such shell.** The settings file travels in git, and a full path in it is a
 * delayed-action mine.
 *
 * `which` comes from the core; here it is substituted and searches this process's PATH,
 * as the real one searches the human's.
 */

const WIN = process.platform === 'win32';
/** On Windows executability is an extension rather than a bit. */
const EXT = WIN ? '.cmd' : '';

let dir: string;
let shell: string;
let hidden: string;

function which(name: string): string | null {
  for (const at of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const suffix of WIN ? ['', '.cmd', '.exe'] : ['']) {
      const full = path.join(at, name + suffix);
      try {
        if (fsSync.statSync(full).isFile()) return full;
      } catch {}
    }
  }
  return null;
}

const shells = new Shells(which);
let savedPath: string | undefined;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-shell-'));
  shell = path.join(dir, `ide-fake-shell${EXT}`);
  await fs.writeFile(shell, '', 'utf8');

  const away = path.join(dir, 'away');
  await fs.mkdir(away, { recursive: true });
  hidden = path.join(away, `ide-fake-shell${EXT}`);
  await fs.writeFile(hidden, '', 'utf8');

  savedPath = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${savedPath ?? ''}`;
});

afterAll(async () => {
  process.env.PATH = savedPath;
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('what to launch terminals with', () => {
  it('a name is looked up in PATH, and a path is taken as it is', () => {
    expect(shells.resolveShell(`ide-fake-shell${EXT}`)).toBe(shell);
    expect(shells.resolveShell(shell)).toBe(shell);
    expect(shells.resolveShell(path.join(dir, 'no-such'))).toBeNull();
    expect(shells.resolveShell('ide-no-such-shell')).toBeNull();
    expect(shells.resolveShell('   ')).toBeNull();
  });

  it('the name travels into the config when that is lossless', () => {
    expect(shells.ref(shell)).toBe(`ide-fake-shell${EXT}`);
    expect(path.isAbsolute(shells.ref(shell))).toBe(false);
  });

  it('a foreign shell of the same name must not be shortened', () => {
    expect(shells.ref(hidden)).toBe(hidden);
  });

  it('what was written reads back to the same file', () => {
    for (const original of [shell, hidden]) {
      const stored = shells.ref(original);
      expect(shells.loginShell({ shell: stored }).file, stored).toBe(original);
    }
  });

  it('a shell from another machine does not break this one, but it does not stay silent either', () => {
    const alien = WIN ? '/bin/zsh' : 'C:\\WINDOWS\\system32\\cmd.exe';
    const choice = shells.loginShell({ shell: alien });

    expect(choice.problem, 'the substitution has to be named').toBe(alien);
    expect(choice.file).not.toBe(alien);
    expect(choice.file).toBe(shells.loginShell().file);
  });

  it('an empty string means "as the system decides" rather than a breakage', () => {
    expect(shells.loginShell({ shell: '' }).problem).toBeUndefined();
    expect(shells.loginShell({ shell: '' }).file).toBe(shells.loginShell().file);
  });

  it('the arguments are picked by the shell that was FOUND rather than by the entry', () => {
    const choice = shells.loginShell({ shell: `ide-fake-shell${EXT}` });
    expect(choice.file).toBe(shell);
    expect(shells.loginShell({ shell: shell, args: ['--mine'] }).args).toEqual(['--mine']);
  });
});
