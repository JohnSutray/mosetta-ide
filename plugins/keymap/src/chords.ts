import type { KeyBinding } from './types.js';
import { keyRules } from './dispatcher.js';

/**
 * The modifiers of every chord alive here for the command. The main key does not
 * matter.
 */
function modifiersOf(bindings: readonly KeyBinding[], command: string): Set<string>[] {
  return bindings
    .filter((binding) => binding.command === command && keyRules.appliesHere(binding))
    .map((binding) => new Set(binding.key.split('+').slice(0, -1)))
    .filter((mods) => mods.size > 0);
}

/**
 * Whether exactly what this command is called by is held right now. The match is exact:
 * with an extra Shift this is already a different chord, and pretending it is the same
 * one is not allowed.
 */
export function chordHeld(
  bindings: readonly KeyBinding[],
  command: string,
  event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
): boolean {
  return modifiersOf(bindings, command).some(
    (mods) =>
      mods.has('meta') === event.metaKey &&
      mods.has('control') === event.ctrlKey &&
      mods.has('alt') === event.altKey &&
      mods.has('shift') === event.shiftKey,
  );
}
