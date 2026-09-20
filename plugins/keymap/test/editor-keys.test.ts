import { InputMechanics } from '@mosetta/ide-plugin-code';
import { describe, expect, it } from 'vitest';
import type { KeyBinding as CmBinding } from '@codemirror/view';
import { WORLDS, inWorld, keymap } from './keymap-shared.js';

const inputMechanics = new InputMechanics();

/** On a Mac `mac` applies if it is given; otherwise the common `key`. */
function macKey(binding: CmBinding): string {
  return binding.mac ?? binding.key ?? '';
}

/**
 * Everything the editor is allowed. This is MECHANICS: moving the caret, selecting,
 * erasing, breaking a line, indenting with Tab, and Cmd+A. Not one row that would do
 * something to the text on a decision of its own.
 */
const MECHANICS = new Set([
  'ArrowLeft', 'Alt-ArrowLeft', 'Cmd-ArrowLeft',
  'ArrowRight', 'Alt-ArrowRight', 'Cmd-ArrowRight',
  'ArrowUp', 'Cmd-ArrowUp', 'Ctrl-ArrowUp',
  'ArrowDown', 'Cmd-ArrowDown', 'Ctrl-ArrowDown',
  'PageUp', 'PageDown',
  'Home', 'Mod-Home', 'End', 'Mod-End',
  'Enter', 'Mod-a',
  'Backspace', 'Delete',
  'Alt-Backspace', 'Alt-Delete', 'Mod-Backspace', 'Mod-Delete',
]);

describe('the editor brings no keys of other people\'s', () => {
  it('the editor has only the input mechanics — and nothing beyond the list', () => {
    const extra = inputMechanics.keymap.map(macKey).filter((key) => !MECHANICS.has(key));
    expect(
      extra,
      `the editor has taken keys of its own besides the mechanics: ${extra.join(', ')}`,
    ).toEqual([]);
  });

  it('the emacs layer on Control is thrown out whole', () => {
    const alive = inputMechanics.keymap.map(macKey).filter((key) => inputMechanics.droppedEmacs.includes(key));
    expect(alive, `emacs keys are alive: ${alive.join(', ')}`).toEqual([]);
    expect(inputMechanics.droppedEmacs).toContain('Ctrl-k');
  });

  it('the mechanics are in place: without them the editor stops being an editor', () => {
    const keys = new Set(inputMechanics.keymap.map(macKey));
    for (const must of ['ArrowLeft', 'Backspace', 'Enter', 'Mod-a']) {
      expect(keys.has(must), `the mechanics for ${must}`).toBe(true);
    }
  });

  it('not one of the editor\'s keys argues with the declared layout', () => {
    const SAME = new Set([
      'edit.wordLeft',
      'edit.wordRight',
      'edit.selectWordLeft',
      'edit.selectWordRight',
    ]);
    const bindings = keymap().bindings;
    for (const world of WORLDS) {
      const mechanics = inputMechanics.keys(world.isMac);
      const ours = new Map(
        inWorld(bindings, world)
          .filter((binding) => ['global', 'editor'].includes(binding.when ?? 'global'))
          .filter((binding) => binding.key.includes('+'))
          .map((binding) => [binding.key, binding.command]),
      );
      const clashes = [...mechanics]
        .filter((key) => ours.has(key) && !SAME.has(ours.get(key)!))
        .map((key) => `${key} = ${ours.get(key)}`);
      expect(clashes, `${world.scope}: somebody else's key on top of ours — ${clashes.join(', ')}`).toEqual(
        [],
      );
    }
  });
});
