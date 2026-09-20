import type { KeyBinding } from './types.js';
import { keyHost } from './host.js';
import { keyRules } from './dispatcher.js';

/**
 * A command's keys from the LOADED layout.
 *
 * The key is taken from the layout rather than from the dictionary: a hint written by
 * hand lies twice over — when the binding has been changed, and when the environment is
 * a different one. The dictionary used to say "Push current branch (Cmd+Shift+K)", and
 * in the browser that was untrue.
 *
 * A chord with a digit is shown first: it is the button's ordinal number in the
 * toolbar, and it is also the rule the button is obliged to explain by itself.
 *
 * In a file of its own rather than inside the toolbar: the toolbar has moved into a
 * plugin, while these keys are wanted by anyone who draws a button.
 */
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

/** A chord with a digit goes first: it is the button's ordinal number. */
function rank(key: string): number {
  return /\d$/.test(key) ? 0 : 1;
}
