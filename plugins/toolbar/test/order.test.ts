import { describe, expect, it } from 'vitest';
import { WORLDS, inWorld, keymap, toolbarOrder } from './keymap-shared.js';

describe('порядок кнопок', () => {
  it('цифра зовёт кнопку с тем же номером в каждом окружении', () => {
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
        expect(numbered.get(digit), `${world.scope}: цифра ${digit} зовёт не ту кнопку`).toBe(command);
      });
      expect(numbered.size, `${world.scope}: лишние цифры`).toBe(NUMBERED.length);
    }
  });
});
