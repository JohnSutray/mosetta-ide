import { describe, expect, it } from 'vitest';
import type { KeyBinding as CmBinding } from '@codemirror/view';
import { WORLDS, inWorld, keymap } from './keymap-shared.js';
import { droppedEmacsKeys, inputKeymap, mechanicsKeys } from '../src/editor/input-keymap.js';

function macKey(binding: CmBinding): string {
  return binding.mac ?? binding.key ?? '';
}

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

describe('редактор не приносит чужих клавиш', () => {
  it('у редактора только механика ввода — и ничего сверх списка', () => {
    const extra = inputKeymap.map(macKey).filter((key) => !MECHANICS.has(key));
    expect(
      extra,
      `редактор завёл свои клавиши помимо механики: ${extra.join(', ')}`,
    ).toEqual([]);
  });

  it('эмаксовый слой на Control выкинут целиком', () => {
    const alive = inputKeymap.map(macKey).filter((key) => droppedEmacsKeys.includes(key));
    expect(alive, `эмаксовые клавиши живы: ${alive.join(', ')}`).toEqual([]);
    expect(droppedEmacsKeys).toContain('Ctrl-k');
  });

  it('механика на месте: без неё редактор перестанет быть редактором', () => {
    const keys = new Set(inputKeymap.map(macKey));
    for (const must of ['ArrowLeft', 'Backspace', 'Enter', 'Mod-a']) {
      expect(keys.has(must), `пропала механика ${must}`).toBe(true);
    }
  });

  it('ни одна клавиша редактора не спорит с объявленной раскладкой', () => {
    const SAME = new Set([
      'edit.wordLeft',
      'edit.wordRight',
      'edit.selectWordLeft',
      'edit.selectWordRight',
    ]);
    const bindings = keymap().bindings;
    for (const world of WORLDS) {
      const mechanics = mechanicsKeys(world.isMac);
      const ours = new Map(
        inWorld(bindings, world)
          .filter((binding) => ['global', 'editor'].includes(binding.when ?? 'global'))
          .filter((binding) => binding.key.includes('+'))
          .map((binding) => [binding.key, binding.command]),
      );
      const clashes = [...mechanics]
        .filter((key) => ours.has(key) && !SAME.has(ours.get(key)!))
        .map((key) => `${key} = ${ours.get(key)}`);
      expect(clashes, `${world.scope}: чужая клавиша поверх нашей — ${clashes.join(', ')}`).toEqual(
        [],
      );
    }
  });
});
