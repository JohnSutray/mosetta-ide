import { keymap } from '@ide/api/client';
import { keyRules } from './dispatcher.js';

function modifiersOf(command: string): Set<string>[] {
  return keymap.value.bindings
    .filter((binding) => binding.command === command && keyRules.appliesHere(binding))
    .map((binding) => new Set(binding.key.split('+').slice(0, -1)))
    .filter((mods) => mods.size > 0);
}

export function chordHeld(
  command: string,
  event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
): boolean {
  return modifiersOf(command).some(
    (mods) =>
      mods.has('meta') === event.metaKey &&
      mods.has('control') === event.ctrlKey &&
      mods.has('alt') === event.altKey &&
      mods.has('shift') === event.shiftKey,
  );
}
