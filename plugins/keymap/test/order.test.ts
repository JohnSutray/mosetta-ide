import { describe, expect, it } from 'vitest';
import { KeymapOrder } from '../src/order.js';
import { FACTORY_KEYMAP } from '../src/keymap.js';
import type { KeyBinding, KeyContext } from '../src/types.js';

/**
 * The order of the rows in the editor: the surface first, and within it the shipping
 * order. It is checked because it is the LOOK of the screen: mixing up the groups means
 * showing the human three identical chords in a row with no explanation of which one is
 * theirs.
 */
const order = new KeymapOrder();

function row(command: string, when?: KeyContext): KeyBinding {
  return { command, key: 'meta+k', ...(when ? { when } : {}) };
}

describe('the order of the layout\'s rows', () => {
  it('the global ones first: they work everywhere', () => {
    const sorted = order.sort([row('a', 'terminal'), row('b'), row('c', 'editor')]);
    expect(sorted.map((one) => one.command)).toEqual(['b', 'c', 'a']);
  });

  it('within a surface the shipping order is left alone', () => {
    const sorted = order.sort([row('a', 'editor'), row('b', 'tree'), row('c', 'editor')]);
    expect(sorted.map((one) => one.command)).toEqual(['a', 'c', 'b']);
  });

  it('an unfamiliar surface goes to the end rather than getting lost', () => {
    const sorted = order.sort([row('a', 'invented' as KeyContext), row('b', 'editor')]);
    expect(sorted.map((one) => one.command)).toEqual(['b', 'a']);
  });

  it('on the real shipment: not one row lost and the groups intact', () => {
    const sorted = order.sort(FACTORY_KEYMAP.bindings);
    expect(sorted).toHaveLength(FACTORY_KEYMAP.bindings.length);
    const ranks = sorted.map((one) => order.rank(one.when));
    expect(ranks, 'the ranks do not decrease — which means the groups are not broken up').toEqual([...ranks].sort((a, b) => a - b));
  });

  it('there is no `global` in the choice of surface: "everywhere" is an empty context', () => {
    expect(order.pickable).not.toContain('global');
    expect(order.contexts[0]).toBe('global');
  });
});
