import { FACTORY_KEYMAP } from '../src/keymap.js';
import { TOOLBAR_DEFAULTS } from '../../toolbar/src/settings.js';
import type { KeyBinding, KeyScope, Keymap } from '../src/types.js';

/**
 * The factory layout is the PLUGIN's DATA: the user's file holds only their own
 * differences, and we check the shipment where it lives — in the code.
 */
export function keymap(): Keymap {
  return FACTORY_KEYMAP;
}

/**
 * The order of the toolbar's buttons is a setting too, and the SHIPPED order is the
 * plugin's defaults. A human's file holds only their differences, so we check the
 * shipment where it lives — in the code, exactly as we do with the keymap.
 */
export function toolbarOrder(): string[] {
  return TOOLBAR_DEFAULTS.order;
}

/** Every environment the layout is obliged to make sense in. */
export const WORLDS: Array<{ scope: KeyScope; host: KeyScope; isMac: boolean }> = [
  { scope: 'browser:mac', host: 'browser', isMac: true },
  { scope: 'browser:win', host: 'browser', isMac: false },
  { scope: 'electron:mac', host: 'electron', isMac: true },
  { scope: 'electron:win', host: 'electron', isMac: false },
];

export function inWorld(bindings: KeyBinding[], world: (typeof WORLDS)[number]): KeyBinding[] {
  return bindings.filter(
    (binding) =>
      !binding.where ||
      binding.where.length === 0 ||
      binding.where.includes(world.scope) ||
      binding.where.includes(world.host),
  );
}
