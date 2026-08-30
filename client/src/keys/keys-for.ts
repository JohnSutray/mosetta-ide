import { keymap } from '../state/config.js';
import { keyHost } from './host.js';
import { appliesHere } from './dispatcher.js';

export function keysFor(command: string): string[] {
  return keymap.value.bindings
    .filter(
      (binding) =>
        binding.command === command &&
        (binding.when ?? 'global') === 'global' &&
        appliesHere(binding),
    )
    .map((binding) => keyHost.humanize(binding.key))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 2);
}

function rank(key: string): number {
  return /\d$/.test(key) ? 0 : 1;
}
