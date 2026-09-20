import { emacsStyleKeymap, standardKeymap } from '@codemirror/commands';
import type { KeyBinding } from '@codemirror/view';

/** The Emacs layer: it is mixed into `standardKeymap`, but only for the Mac. */
const EMACS = new Set(emacsStyleKeymap.map((binding) => binding.key ?? ''));

/**
 * The Emacs rows are recognised by how they were mixed in: they have `mac` and no
 * `key`. The comparison goes by the KEY's NAME rather than by the function: the
 * functions there are shared with ordinary rows (`deleteCharForward` lives on Delete
 * too), and filtering by them would have swept away too much.
 */
function isEmacsLayer(binding: KeyBinding): boolean {
  return binding.key === undefined && typeof binding.mac === 'string' && EMACS.has(binding.mac);
}

const INPUT_KEYMAP: readonly KeyBinding[] = standardKeymap.filter(
  (binding) => !isEmacsLayer(binding),
);

/** Exactly what was thrown out — for the test that watches this list. */
const DROPPED_EMACS: readonly string[] = [...EMACS];

/**
 * The same keys, but written AS THE DISPATCHER SEES THEM.
 *
 * Needed by exactly one place: the complaint "nothing is bound to this key". Cmd+A and
 * Cmd+Backspace in the editor really do call nothing from the keymap — they are handled
 * by the input mechanics — and complaining about them would mean complaining about
 * something that works.
 *
 * CodeMirror's `Mod` on a Mac is Cmd, whereas our leading modifier is Control in a
 * browser. Hence a translation rather than a string comparison.
 */
export class InputMechanics {
  /**
   * The keys the editor is allowed to have as its OWN: the arrows, Home/End, Backspace,
   * Enter, selection, Cmd+A. Everything that is a COMMAND is declared in the keymap and
   * arrives through the dispatcher.
   */
  readonly keymap = INPUT_KEYMAP;

  /** What we took away from somebody else's map — read by a test. */
  readonly droppedEmacs = DROPPED_EMACS;

  /**
   * The names of these keys in our notation: the dispatcher stays silent about a miss
   * on them.
   */
  keys(isMac: boolean): Set<string> {
    return new Set(
      this.keymap
        .map((binding) => (isMac ? (binding.mac ?? binding.key) : binding.key) ?? '')
        .filter((key) => key !== '')
        .map((key) => this.asPhysical(key, isMac)),
    );
  }

  /** `Shift-Mod-k` → `meta+shift+k` on a Mac, `control+shift+k` elsewhere. */
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
