import { describe, expect, it } from 'vitest';
import { WORLDS, inWorld, keymap } from './keymap-shared.js';

/**
 * The layout does not argue with itself.
 *
 * Both rules below were written after real breakages, and both surfaced not from a test
 * but by eye:
 *
 * - `scripts.rerun` landed on `file.reload`'s key — in all four environments at once.
 * The server honestly grumbled at every start, and nobody read that for a whole day;
 *
 * - the move to Cmd left three duplicate rows. The "Keys" window noticed them, showing
 * the command twice in a row.
 *
 * Both troubles are quiet ones: the layout loads, the key works, it is simply the wrong
 * one or not the only one. That is caught by a list rather than by a glance.
 */
describe('the layout does not argue with itself', () => {
  it('one key in one environment and context calls one command', () => {
    const clashes: string[] = [];
    for (const world of WORLDS) {
      const owner = new Map<string, string>();
      for (const binding of inWorld(keymap().bindings, world)) {
        const at = `${binding.when ?? 'global'} ${binding.key}`;
        const taken = owner.get(at);
        if (taken && taken !== binding.command) {
          clashes.push(`${world.scope}: ${at} — ${taken} and ${binding.command}`);
        }
        owner.set(at, binding.command);
      }
    }
    expect(clashes, `arguing over one key:\n${clashes.join('\n')}`).toEqual([]);
  });

  it('one and the same row is not written twice', () => {
    const twins: string[] = [];
    for (const world of WORLDS) {
      const seen = new Set<string>();
      for (const binding of inWorld(keymap().bindings, world)) {
        const row = `${binding.command} ${binding.when ?? 'global'} ${binding.key}`;
        if (seen.has(row)) twins.push(`${world.scope}: ${row}`);
        seen.add(row);
      }
    }
    expect(twins, `duplicate rows:\n${twins.join('\n')}`).toEqual([]);
  });

  it('the git branches hang on the key under Escape rather than on the character', () => {
    const bound = keymap().bindings.filter((b) => b.key.endsWith('+backquote'));
    expect(bound.length, 'the key under Escape has gone missing').toBeGreaterThan(0);
    for (const binding of bound) expect(binding.command).toBe('git.branches');
  });
});
