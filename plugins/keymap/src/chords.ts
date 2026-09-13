import type { KeyBinding } from './types.js';
import { keyRules } from './dispatcher.js';

function modifiersOf(bindings: readonly KeyBinding[], command: string): Set<string>[] {
  return bindings
    .filter((binding) => binding.command === command && keyRules.appliesHere(binding))
    .map((binding) => new Set(binding.key.split('+').slice(0, -1)))
    .filter((mods) => mods.size > 0);
}

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
