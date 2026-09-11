import type { KeyBinding } from '@mosetta/ide-protocol';
import { keyHost } from './host.js';
import { keyRules } from './dispatcher.js';

export function keysFor(bindings: readonly KeyBinding[], command: string): string[] {
  return bindings
    .filter(
      (binding) =>
        binding.command === command &&
        (binding.when ?? 'global') === 'global' &&
        keyRules.appliesHere(binding),
    )
    .map((binding) => keyHost.humanize(binding.key))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 2);
}

function rank(key: string): number {
  return /\d$/.test(key) ? 0 : 1;
}
