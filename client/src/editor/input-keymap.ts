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

export function mechanicsKeys(isMac: boolean): Set<string> {
  return new Set(
    inputKeymap
      .map((binding) => (isMac ? (binding.mac ?? binding.key) : binding.key) ?? '')
      .filter((key) => key !== '')
      .map((key) => asPhysical(key, isMac)),
  );
}

function asPhysical(key: string, isMac: boolean): string {
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
