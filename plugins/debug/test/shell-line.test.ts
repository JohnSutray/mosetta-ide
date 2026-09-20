import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { shellLine } from '../src/shell-line.js';

/**
 * A run line for a shell: what the adapter asks to be carried out in a terminal is
 * obliged to reach the program LITERALLY — with its spaces, quotes and environment
 * variables. We check not only the form but with a real `sh` too: quoting is a
 * conversation with the shell rather than with us.
 */
describe('a line for the shell', () => {
  it('it leaves simple words alone and puts the rest in single quotes', () => {
    expect(shellLine.quote('node')).toBe('node');
    expect(shellLine.quote('/usr/local/bin/node')).toBe('/usr/local/bin/node');
    expect(shellLine.quote('a b')).toBe("'a b'");
    expect(shellLine.quote("it's")).toBe(`'it'\\''s'`);
    expect(shellLine.quote('')).toBe("''");
  });

  it('the environment variables travel before the command through env, a null is skipped', () => {
    const line = shellLine.compose(['node', 'app.js'], { NODE_OPTIONS: '--require /x/boot loader.js', GONE: null });
    expect(line).toBe("env NODE_OPTIONS='--require /x/boot loader.js' node app.js");
  });

  it.skipIf(process.platform === 'win32')('a real sh receives the same words and the same environment', () => {
    const line = shellLine.compose(
      [process.execPath, '-e', 'console.log(JSON.stringify([process.argv.slice(1), process.env.PROBE]))', 'x y', "it's"],
      { PROBE: 'a=b c' },
    );
    const out = execFileSync('sh', ['-c', line], { encoding: 'utf8' }).trim();
    expect(JSON.parse(out)).toEqual([['x y', "it's"], 'a=b c']);
  });
});
