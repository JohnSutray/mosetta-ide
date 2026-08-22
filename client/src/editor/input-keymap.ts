import { emacsStyleKeymap, standardKeymap } from '@codemirror/commands';
import type { KeyBinding } from '@codemirror/view';

const EMACS = new Set(emacsStyleKeymap.map((binding) => binding.key ?? ''));

function isEmacsLayer(binding: KeyBinding): boolean {
  return binding.key === undefined && typeof binding.mac === 'string' && EMACS.has(binding.mac);
}

export const inputKeymap: readonly KeyBinding[] = standardKeymap.filter(
  (binding) => !isEmacsLayer(binding),
);

export const droppedEmacsKeys: readonly string[] = [...EMACS];

export function mechanicsKeys(modIsMeta: boolean, isMac: boolean): Set<string> {
  return new Set(
    inputKeymap
      .map((binding) => (isMac ? (binding.mac ?? binding.key) : binding.key) ?? '')
      .filter((key) => key !== '')
      .map((key) => asOurKey(key, modIsMeta, isMac)),
  );
}

function asOurKey(key: string, modIsMeta: boolean, isMac: boolean): string {
  const parts = key.split('-');
  const main = (parts.pop() ?? '').toLowerCase();
  const mods = new Set(parts.map((part) => part.toLowerCase()));
  const meta = isMac ? mods.has('mod') || mods.has('cmd') : mods.has('cmd');
  const ctrl = mods.has('ctrl') || (!isMac && mods.has('mod'));

  const out: string[] = [];
  if (modIsMeta ? meta : ctrl) out.push('mod');
  if (modIsMeta && ctrl) out.push('ctrl');
  if (!modIsMeta && isMac && meta) out.push('cmd');
  if (mods.has('alt')) out.push('alt');
  if (mods.has('shift')) out.push('shift');
  out.push(main);
  return out.join('+');
}
