import { reserved } from '../src/keys/reserved.js';
import { describe, expect, it } from 'vitest';
import { WORLDS, inWorld, keymap } from './keymap-shared.js';

describe('раскладка не лезет на отнятые клавиши', () => {
  it('каждый спор либо расшит, либо назван в биндинге', () => {
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

    expect(clashes, `биндинги на отнятые клавиши:\n${clashes.join('\n')}`).toEqual([]);
  });

  it('в раскладке нет ролей — только физические имена', () => {
    for (const binding of keymap().bindings) {
      expect(binding.key, `роль в раскладке: ${binding.key}`).not.toMatch(
        /\b(mod|clip|aux|cmd|ctrl)\b/,
      );
    }
  });

  it('у каждой команды есть клавиша в КАЖДОМ окружении', () => {
    const bindings = keymap().bindings;
    const everywhere = new Set(bindings.map((b) => b.command));
    for (const world of WORLDS) {
      const here = new Set(inWorld(bindings, world).map((b) => b.command));
      const lost = [...everywhere].filter((command) => !here.has(command));
      expect(lost, `${world.scope}: команды без клавиши — ${lost.join(', ')}`).toEqual([]);
    }
  });

  it('в таблице нет дублей и записана она физикой', () => {
    const seen = new Set<string>();
    for (const item of reserved.table) {
      expect(item.scopes.length, `${item.key}: не сказано, где отнято`).toBeGreaterThan(0);
      for (const scope of item.scopes) {
        const id = `${scope} ${item.key}`;
        expect(seen.has(id), `дубль: ${id}`).toBe(false);
        seen.add(id);
      }
      expect(item.key).not.toMatch(/\b(mod|clip)\b/);
      expect(item.who).not.toBe('');
      expect(item.what).not.toBe('');
    }
  });
});
