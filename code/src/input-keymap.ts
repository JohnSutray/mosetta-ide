import { emacsStyleKeymap, standardKeymap } from '@codemirror/commands';
import type { KeyBinding } from '@codemirror/view';

const EMACS = new Set(emacsStyleKeymap.map((binding) => binding.key ?? ''));

function isEmacsLayer(binding: KeyBinding): boolean {
  return binding.key === undefined && typeof binding.mac === 'string' && EMACS.has(binding.mac);
}

const INPUT_KEYMAP: readonly KeyBinding[] = standardKeymap.filter(
  (binding) => !isEmacsLayer(binding),
);

const DROPPED_EMACS: readonly string[] = [...EMACS];

export class InputMechanics {
  readonly keymap = INPUT_KEYMAP;

  readonly droppedEmacs = DROPPED_EMACS;

  keys(isMac: boolean): Set<string> {
    return new Set(
      this.keymap
        .map((binding) => (isMac ? (binding.mac ?? binding.key) : binding.key) ?? '')
        .filter((key) => key !== '')
        .map((key) => this.asPhysical(key, isMac)),
    );
  }

  private asPhysical(key: string, isMac: boolean): string {
    const parts = key.split('-');
    const main = (parts.pop() ?? '').toLowerCase();
    const mods = new Set(parts.map((part) => part.toLowerCase()));
    const meta = mods.has('cmd') || (isMac && mods.has('mod'));
    const control = mods.has('ctrl') || (!isMac && mods.has('mod'));

    const out: string[] = [];
    if (meta) out.push('meta');
    if (control) out.push('control');
    if (mods.has('alt')) out.push('alt');
    if (mods.has('shift')) out.push('shift');
    out.push(main);
    return out.join('+');
  }
}

export const inputMechanics = new InputMechanics();
