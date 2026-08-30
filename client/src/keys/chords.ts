import { config } from '../state/config.js';
import { appliesHere } from './dispatcher.js';

function modifiersOf(command: string): Set<string>[] {
  return config.keymap.value.bindings
    .filter((binding) => binding.command === command && appliesHere(binding))
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
