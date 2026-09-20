import { reserved } from '../src/reserved.js';
import { describe, expect, it } from 'vitest';
import { WORLDS, inWorld, keymap } from './keymap-shared.js';

/**
 * The taken keys.
 *
 * The test is the table's second job after the plate: a binding on a taken key does not
 * pass until it says explicitly that it does not work there. Otherwise the knowledge
 * crawls back into people's heads and surfaces as half an hour of investigation.
 */

describe('the layout does not climb onto taken keys', () => {
  it('every argument is either resolved or named in the binding', () => {
    const bindings = keymap().bindings;
    const clashes: string[] = [];

    for (const world of WORLDS) {
      const taken = new Map(
        reserved.hardIn([world.scope]).map((item) => [item.key, `${item.who}: ${item.what}`]),
      );
      for (const binding of inWorld(bindings, world)) {
        const bare = binding.key.startsWith('double:') ? binding.key.slice(7) : binding.key;
        const who = taken.get(binding.key) ?? taken.get(bare);
        if (who) clashes.push(`${world.scope}: ${binding.key} — ${who}`);
      }
    }

    expect(clashes, `bindings on taken keys:\n${clashes.join('\n')}`).toEqual([]);
  });

  it('there are no roles in the layout — only physical names', () => {
    for (const binding of keymap().bindings) {
      expect(binding.key, `a role in the layout: ${binding.key}`).not.toMatch(
        /\b(mod|clip|aux|cmd|ctrl)\b/,
      );
    }
  });

  it('every command has a key in EVERY environment', () => {
    const bindings = keymap().bindings;
    const everywhere = new Set(bindings.map((b) => b.command));
    for (const world of WORLDS) {
      const here = new Set(inWorld(bindings, world).map((b) => b.command));
      const lost = [...everywhere].filter((command) => !here.has(command));
      expect(lost, `${world.scope}: commands with no key — ${lost.join(', ')}`).toEqual([]);
    }
  });

  it('there are no duplicates in the table, and it is written in physics', () => {
    const seen = new Set<string>();
    for (const item of reserved.table) {
      expect(item.scopes.length, `${item.key}: it does not say where it is taken`).toBeGreaterThan(0);
      for (const scope of item.scopes) {
        const id = `${scope} ${item.key}`;
        expect(seen.has(id), `a duplicate: ${id}`).toBe(false);
        seen.add(id);
      }
      expect(item.key).not.toMatch(/\b(mod|clip)\b/);
      expect(item.who).not.toBe('');
      expect(item.what).not.toBe('');
    }
  });
});
