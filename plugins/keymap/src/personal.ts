import { keymapRules } from './rules.js';
import type { KeyBinding, Keymap } from './types.js';

/**
 * My edits to the layout: what exactly goes into the `keymap` section of my
 * `settings.json` when I reassign a key in the settings window.
 *
 * The logic here is pure — no DOM, no settings — because getting it wrong is expensive:
 * the factory layout must neither disappear nor double, and "put it back as it was" is
 * obliged to put it back EXACTLY as it was.
 *
 * The rule is simple: my row in the same PLACE (key, context, environment) replaces the
 * factory one, a row with `remove` takes it away. So a reassignment is two entries:
 * give up the old place and take the new one.
 */
export class PersonalKeymap {
  /**
   * Empty means everything is the factory's; that is how we store it, and an empty
   * section removes itself.
   */
  readonly empty: Keymap = { version: 1, bindings: [] };

  /**
   * Reassign a row: it stops being in the old place and stands in the new one. The
   * command may change along with it — this is one action by the human rather than two.
   */
  rebind(mine: Keymap, factory: Keymap, was: KeyBinding, next: KeyBinding): Keymap {
    const rest = this.without(mine, was);
    const bindings = [...rest.bindings];
    if (this.inFactory(factory, was) && keymapRules.slotOf(was) !== keymapRules.slotOf(next)) {
      bindings.push(this.removalOf(was));
    }
    bindings.push(next);
    return { ...mine, bindings };
  }

  /** Add a row of my own in a free place. */
  add(mine: Keymap, binding: KeyBinding): Keymap {
    return { ...mine, bindings: [...this.without(mine, binding).bindings, binding] };
  }

  /**
   * Bring back the factory one — for THIS COMMAND rather than for this place.
   *
   * The place will not do here, and that cost a live check: a reassignment is two
   * entries, mine in the new place and a removal in the old one. Taking away only the
   * first, I gave the command back its old key… which the second entry still removed.
   * What the human asks for is simple: "let Git branches be as it ships again" — which
   * means ALL my rows about this command go.
   */
  restore(mine: Keymap, command: string): Keymap {
    return { ...mine, bindings: mine.bindings.filter((one) => one.command !== command) };
  }

  /**
   * Take the key away altogether: a factory one by a removal, my own by simply throwing
   * it out.
   */
  drop(mine: Keymap, factory: Keymap, was: KeyBinding): Keymap {
    const rest = this.without(mine, was);
    if (!this.inFactory(factory, was)) return rest;
    return { ...rest, bindings: [...rest.bindings, this.removalOf(was)] };
  }

  /**
   * What I have TAKEN AWAY: the removal rows from my layer.
   *
   * They are not in the working layout — that is the whole point — and so they will not
   * appear in the list by themselves, and there would be nothing to bring them back
   * with short of editing the file. So the editor shows them separately: what has been
   * removed stays visible.
   */
  removed(mine: Keymap): KeyBinding[] {
    return mine.bindings.filter((one) => one.remove === true);
  }

  /** Whether this row is mine — what to offer the human depends on it. */
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

/** One per plugin: it has no state, and there is one place for it. */
export const personalKeymap = new PersonalKeymap();
