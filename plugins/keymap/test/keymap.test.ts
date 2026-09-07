import { describe, expect, it } from 'vitest';
import { WORLDS, inWorld, keymap } from './keymap-shared.js';

describe('раскладка сама с собой не спорит', () => {
  it('одна клавиша в одном окружении и контексте зовёт одну команду', () => {
    const clashes: string[] = [];
    for (const world of WORLDS) {
      const owner = new Map<string, string>();
      for (const binding of inWorld(keymap().bindings, world)) {
        const at = `${binding.when ?? 'global'} ${binding.key}`;
        const taken = owner.get(at);
        if (taken && taken !== binding.command) {
          clashes.push(`${world.scope}: ${at} — ${taken} и ${binding.command}`);
        }
        owner.set(at, binding.command);
      }
    }
    expect(clashes, `спорят за одну клавишу:\n${clashes.join('\n')}`).toEqual([]);
  });

  it('одна и та же строка не написана дважды', () => {
    const twins: string[] = [];
    for (const world of WORLDS) {
      const seen = new Set<string>();
      for (const binding of inWorld(keymap().bindings, world)) {
        const row = `${binding.command} ${binding.when ?? 'global'} ${binding.key}`;
        if (seen.has(row)) twins.push(`${world.scope}: ${row}`);
        seen.add(row);
      }
    }
    expect(twins, `строки-дубли:\n${twins.join('\n')}`).toEqual([]);
  });

  it('ветки git висят на клавише под Escape, а не на символе', () => {
    const bound = keymap().bindings.filter((b) => b.key.endsWith('+backquote'));
    expect(bound.length, 'клавиша под Escape потерялась').toBeGreaterThan(0);
    for (const binding of bound) expect(binding.command).toBe('git.branches');
  });
});
