import { describe, expect, it } from 'vitest';
import { WORLDS, inWorld, keymap, toolbarOrder } from './keymap-shared.js';

/**
 * A digit is a button's ordinal position in the toolbar, left to right. A rule rather
 * than a list: a button inserted in the middle is obliged to shift the numbers,
 * otherwise the third digit calls something other than what the finger points at. The
 * order comes from the `toolbar.order` setting in the REAL settings file, and the
 * keymap from the real keymap.
 */
describe('the order of the buttons', () => {
  it('a digit calls the button with the same number in every environment', () => {
    const NUMBERED = toolbarOrder().slice(0, 10);
    const bindings = keymap().bindings;
    for (const world of WORLDS) {
      const numbered = new Map<string, string>();
      for (const binding of inWorld(bindings, world)) {
        if ((binding.when ?? 'global') !== 'global') continue;
        const digit = /(?:^|\+)(\d)$/.exec(binding.key)?.[1];
        if (digit) numbered.set(digit, binding.command);
      }
      NUMBERED.forEach((command, at) => {
        const digit = String((at + 1) % 10);
        expect(numbered.get(digit), `${world.scope}: digit ${digit} calls the wrong button`).toBe(command);
      });
      expect(numbered.size, `${world.scope}: extra digits`).toBe(NUMBERED.length);
    }
  });
});
