import { keymapRules } from './rules.js';
import type { KeyBinding, Keymap } from './types.js';

export class PersonalKeymap {
  readonly empty: Keymap = { version: 1, bindings: [] };

  rebind(mine: Keymap, factory: Keymap, was: KeyBinding, next: KeyBinding): Keymap {
    const rest = this.without(mine, was);
    const bindings = [...rest.bindings];
    if (this.inFactory(factory, was) && keymapRules.slotOf(was) !== keymapRules.slotOf(next)) {
      bindings.push(this.removalOf(was));
    }
    bindings.push(next);
    return { ...mine, bindings };
  }

  add(mine: Keymap, binding: KeyBinding): Keymap {
    return { ...mine, bindings: [...this.without(mine, binding).bindings, binding] };
  }

  restore(mine: Keymap, command: string): Keymap {
    return { ...mine, bindings: mine.bindings.filter((one) => one.command !== command) };
  }

  drop(mine: Keymap, factory: Keymap, was: KeyBinding): Keymap {
    const rest = this.without(mine, was);
    if (!this.inFactory(factory, was)) return rest;
    return { ...rest, bindings: [...rest.bindings, this.removalOf(was)] };
  }

  removed(mine: Keymap): KeyBinding[] {
    return mine.bindings.filter((one) => one.remove === true);
  }

  isMine(mine: Keymap, binding: KeyBinding): boolean {
    const slot = keymapRules.slotOf(binding);
    return mine.bindings.some((one) => keymapRules.slotOf(one) === slot);
  }

  private inFactory(factory: Keymap, binding: KeyBinding): boolean {
    const slot = keymapRules.slotOf(binding);
    return factory.bindings.some((one) => keymapRules.slotOf(one) === slot);
  }

  private without(mine: Keymap, binding: KeyBinding): Keymap {
    const slot = keymapRules.slotOf(binding);
    return { ...mine, bindings: mine.bindings.filter((one) => keymapRules.slotOf(one) !== slot) };
  }

  private removalOf(binding: KeyBinding): KeyBinding {
    return {
      command: binding.command,
      key: binding.key,
      ...(binding.when ? { when: binding.when } : {}),
      ...(binding.where ? { where: binding.where } : {}),
      remove: true,
    };
  }
}

export const personalKeymap = new PersonalKeymap();
