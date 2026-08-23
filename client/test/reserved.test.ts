import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { KeyScope, Keymap } from '@ide/protocol';
import { RESERVED, physicalOf } from '../src/keys/reserved.js';
import { keyHere } from '../src/keys/dispatcher.js';

function keymap(): Keymap {
  const raw = fs.readFileSync(
    fileURLToPath(new URL('../../config/keymap.json', import.meta.url)),
    'utf8',
  );
  const clean = raw
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(clean) as Keymap;
}

const WORLDS: Array<{ scope: KeyScope; modIsMeta: boolean; isMac: boolean }> = [
  { scope: 'browser:mac', modIsMeta: false, isMac: true },
  { scope: 'browser:win', modIsMeta: false, isMac: false },
  { scope: 'electron:mac', modIsMeta: true, isMac: true },
];

describe('раскладка не лезет на отнятые клавиши', () => {
  it('каждый спор либо расшит, либо назван в биндинге', () => {
    const bindings = keymap().bindings;
    const clashes: string[] = [];

    for (const world of WORLDS) {
      const taken = new Map(
        RESERVED.filter((item) => item.scopes.includes(world.scope)).map((item) => [
          item.key,
          `${item.who}: ${item.what}`,
        ]),
      );
      for (const binding of bindings) {
        const here = keyHere(binding, [world.scope, world.scope.split(':')[0] as KeyScope]);
        const physical = physicalOf(here, world.modIsMeta, world.isMac);
        const who = taken.get(physical);
        if (!who) continue;
        const named =
          binding.unavailable?.[world.scope] ??
          binding.unavailable?.[world.scope.split(':')[0] as KeyScope];
        if (named) continue;
        clashes.push(`${world.scope}: ${here} (${physical}) — ${who}`);
      }
    }

    expect(clashes, `биндинги на отнятые клавиши:\n${clashes.join('\n')}`).toEqual([]);
  });

  it('роли разворачиваются в физику одинаково с диспетчером', () => {
    expect(physicalOf('mod+1', false, true)).toBe('control+1');
    expect(physicalOf('clip+c', false, true)).toBe('meta+c');
    expect(physicalOf('mod+alt+arrowleft', false, true)).toBe('control+alt+arrowleft');
    expect(physicalOf('mod+1', true, true)).toBe('meta+1');
    expect(physicalOf('clip+c', true, true)).toBe('meta+c');
    expect(physicalOf('double:shift', false, true)).toBe('double:shift');
  });

  it('в таблице нет дублей и записана она физикой', () => {
    const seen = new Set<string>();
    for (const item of RESERVED) {
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
