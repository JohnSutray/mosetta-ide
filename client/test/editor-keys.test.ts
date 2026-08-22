import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { KeyBinding as CmBinding } from '@codemirror/view';
import type { Keymap } from '@ide/protocol';
import { droppedEmacsKeys, inputKeymap } from '../src/editor/input-keymap.js';

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
  'Tab',
]);

function keymap(): Keymap {
  const raw = fs.readFileSync(
    fileURLToPath(new URL('../../config/keymap.json', import.meta.url)),
    'utf8',
  );
  const clean = raw
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(clean) as Keymap;
}

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
    for (const must of ['ArrowLeft', 'Backspace', 'Enter', 'Mod-a', 'Tab']) {
      expect(keys.has(must), `пропала механика ${must}`).toBe(true);
    }
  });

  it('ни одна клавиша редактора не спорит с объявленной раскладкой', () => {
    const ours = keymap().bindings.filter((b) => (b.when ?? 'global') !== 'tree');
    for (const host of ['browser', 'electron'] as const) {
      const declared = new Map(
        ours
          .filter((b) => ['global', 'editor'].includes(b.when ?? 'global'))
          .map((b) => [ourForm(b.key, host), b.command]),
      );
      const clashes = inputKeymap
        .map((binding) => ({ cm: macKey(binding), ours: ourForm(fromCm(macKey(binding)), host) }))
        .filter((pair) => declared.has(pair.ours))
        .map((pair) => `${pair.cm} = ${declared.get(pair.ours)}`);
      expect(clashes, `${host}: чужая клавиша поверх нашей — ${clashes.join(', ')}`).toEqual([]);
    }
  });
});

function fromCm(key: string): string {
  const parts = key.split('-');
  const main = parts.pop() ?? '';
  const mods = new Set(parts.map((part) => part.toLowerCase()));
  const out: string[] = [];
  if (mods.has('mod') || mods.has('cmd') || mods.has('meta')) out.push('cmd');
  if (mods.has('ctrl') || mods.has('control')) out.push('ctrl');
  if (mods.has('alt')) out.push('alt');
  if (mods.has('shift')) out.push('shift');
  out.push(main.toLowerCase());
  return out.join('+');
}

function ourForm(key: string, host: 'browser' | 'electron'): string {
  const lead = host === 'browser' ? 'ctrl' : 'cmd';
  const clip = 'cmd';
  const parts = key.split('+').map((part) => {
    if (part === 'mod') return lead;
    if (part === 'clip') return clip;
    return part;
  });
  const main = parts.pop() ?? '';
  const mods = new Set(parts);
  const out: string[] = [];
  if (mods.has('cmd')) out.push('cmd');
  if (mods.has('ctrl')) out.push('ctrl');
  if (mods.has('alt')) out.push('alt');
  if (mods.has('shift')) out.push('shift');
  out.push(main);
  return out.join('+');
}
