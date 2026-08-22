import { emacsStyleKeymap, indentWithTab, standardKeymap } from '@codemirror/commands';
import type { KeyBinding } from '@codemirror/view';

const EMACS = new Set(emacsStyleKeymap.map((binding) => binding.key ?? ''));

function isEmacsLayer(binding: KeyBinding): boolean {
  return binding.key === undefined && typeof binding.mac === 'string' && EMACS.has(binding.mac);
}

export const inputKeymap: readonly KeyBinding[] = [
  ...standardKeymap.filter((binding) => !isEmacsLayer(binding)),
  indentWithTab,
];

export const droppedEmacsKeys: readonly string[] = [...EMACS];
