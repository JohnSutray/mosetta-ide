import { InputMechanics } from '@ide/plugin-code';
import { reserved } from '../src/reserved.js';
import { describe, expect, it } from 'vitest';
import { keyRules } from '../src/dispatcher.js';
import { keyHost } from '../src/host.js';
import { WORLDS, inWorld, keymap } from './keymap-shared.js';

const inputMechanics = new InputMechanics();
keyRules.useMechanics(inputMechanics.keys(keyHost.isMac));

function press(key: string, target: unknown, mods: Record<string, boolean> = {}) {
  return {
    key,
    code: '',
    target,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  } as unknown as KeyboardEvent;
}

function stroke(code: string, key: string, mods: Record<string, boolean> = {}) {
  return {
    code,
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  } as unknown as KeyboardEvent;
}

const INPUT = { tagName: 'INPUT', isContentEditable: false, value: 'x' };
const AREA = { tagName: 'TEXTAREA', isContentEditable: false, value: 'x' };
const EMPTY = { tagName: 'INPUT', isContentEditable: false, value: '' };
const EDITOR = { tagName: 'DIV', isContentEditable: true };
const ROW = { tagName: 'DIV', isContentEditable: false };

describe('раскладка и поля ввода', () => {
  it('стирающие клавиши в поле принадлежат полю', () => {
    expect(keyRules.typedIntoField(press('Backspace', INPUT))).toBe(true);
    expect(keyRules.typedIntoField(press('Delete', AREA))).toBe(true);
    expect(keyRules.typedIntoField(press('x', EDITOR))).toBe(true);
  });

  it('вне поля они достаются раскладке', () => {
    expect(keyRules.typedIntoField(press('Backspace', ROW))).toBe(false);
    expect(keyRules.typedIntoField(press('Backspace', null))).toBe(false);
  });

  it('контекст editable стоит между своим и глобальным и даётся только полю (ADR-0194)', () => {
    const bindings = [
      { command: 'field.native', key: 'meta+z', when: 'editable' as const },
      { command: 'edit.undo', key: 'meta+z' },
      { command: 'find.next', key: 'enter', when: 'find' as const },
    ];
    expect(keyRules.pick(bindings, 'find', 'meta+z', true)?.command).toBe('field.native');
    expect(keyRules.pick(bindings, 'tree', 'meta+z', false)?.command).toBe('edit.undo');
    expect(keyRules.pick(bindings, 'find', 'enter', true)?.command).toBe('find.next');
    expect(keyRules.inPlainField(INPUT as never)).toBe(true);
    expect(keyRules.inPlainField(EDITOR as never)).toBe(false);
    expect(keyRules.inPlainField(ROW as never)).toBe(false);
  });

  it('цепочка контекстов: своё первым, чего нет — у следующего, потом глобальное (ADR-0200)', () => {
    const bindings = [
      { command: 'completion.accept', key: 'enter', when: 'completion' as const },
      { command: 'edit.undo', key: 'meta+z', when: 'editor' as const },
      { command: 'search.everywhere', key: 'meta+o' },
    ];
    const chain = ['completion', 'editor'] as const;
    expect(keyRules.pick(bindings, chain, 'enter', false)?.command).toBe('completion.accept');
    expect(keyRules.pick(bindings, chain, 'meta+z', false)?.command).toBe('edit.undo');
    expect(keyRules.pick(bindings, chain, 'meta+o', false)?.command).toBe('search.everywhere');
    expect(keyRules.pick(bindings, 'editor', 'enter', false)).toBeUndefined();
  });

  it('в ПУСТОМ поле стирать нечего — Backspace достаётся раскладке (ADR-0193)', () => {
    expect(keyRules.typedIntoField(press('Backspace', EMPTY))).toBe(false);
    expect(keyRules.typedIntoField(press('Delete', EMPTY))).toBe(false);
    expect(keyRules.typedIntoField(press('x', EMPTY))).toBe(true);
  });

  it('аккорд с модификатором текстом не является', () => {
    expect(keyRules.typedIntoField(press('s', INPUT, { metaKey: true }))).toBe(false);
    expect(keyRules.typedIntoField(press('Backspace', INPUT, { altKey: true }))).toBe(false);
  });

  it('Enter, Escape и стрелки проходят: на них держатся списки с поиском', () => {
    expect(keyRules.typedIntoField(press('Enter', INPUT))).toBe(false);
    expect(keyRules.typedIntoField(press('Escape', INPUT))).toBe(false);
    expect(keyRules.typedIntoField(press('ArrowDown', INPUT))).toBe(false);
  });
});

describe('строка нажатия', () => {
  it('модификаторы называются физически и всегда в одном порядке', () => {
    expect(keyRules.eventToKey(stroke('KeyS', 's', { metaKey: true }))).toBe('meta+s');
    expect(keyRules.eventToKey(stroke('KeyS', 's', { ctrlKey: true }))).toBe('control+s');
    expect(keyRules.eventToKey(stroke('KeyS', 's', { altKey: true }))).toBe('alt+s');
    expect(
      keyRules.eventToKey(
        stroke('KeyK', 'k', { metaKey: true, ctrlKey: true, altKey: true, shiftKey: true }),
      ),
    ).toBe('meta+control+alt+shift+k');
  });

  it('ролей в строке события не бывает', () => {
    const cases: Array<Record<string, boolean>> = [
      { metaKey: true },
      { ctrlKey: true },
      { altKey: true },
    ];
    for (const mods of cases) {
      expect(keyRules.eventToKey(stroke('Digit1', '1', mods))).not.toMatch(/\b(mod|clip|cmd|ctrl)\b/);
    }
  });
});

describe('клавиша от клетки, а не от символа', () => {
  it('кириллица не отменяет сохранение', () => {
    expect(keyRules.eventToKey(stroke('KeyS', 'ы', { ctrlKey: true }))).toBe('control+s');
    expect(keyRules.eventToKey(stroke('KeyS', 's', { ctrlKey: true }))).toBe('control+s');
  });

  it('Option приходит собранным символом, а клетка остаётся прежней', () => {
    expect(keyRules.eventToKey(stroke('Digit2', '™', { altKey: true }))).toBe('alt+2');
    expect(keyRules.eventToKey(stroke('Digit3', '£', { altKey: true }))).toBe('alt+3');
  });

  it('клавиша под Escape одна в обеих раскладках', () => {
    expect(keyRules.eventToKey(stroke('Backquote', '`'))).toBe('backquote');
    expect(keyRules.eventToKey(stroke('Backquote', 'ё'))).toBe('backquote');
  });

  it('имена клавиш берутся из кода как есть', () => {
    expect(keyRules.eventToKey(stroke('ArrowDown', 'ArrowDown'))).toBe('arrowdown');
    expect(keyRules.eventToKey(stroke('Escape', 'Escape'))).toBe('escape');
    expect(keyRules.eventToKey(stroke('Space', ' '))).toBe('space');
    expect(keyRules.eventToKey(stroke('Slash', '.'))).toBe('slash');
  });

  it('голый модификатор клавишей не считается', () => {
    expect(keyRules.eventToKey(stroke('ShiftLeft', 'Shift', { shiftKey: true }))).toBe(null);
  });

  it('без кода остаётся запасной путь по символу', () => {
    expect(keyRules.eventToKey(stroke('', 'ё'))).toBe('backquote');
    expect(keyRules.eventToKey(stroke('', 'k', { ctrlKey: true }))).toBe('control+k');
  });
});

describe('жалоба на клавишу без команды', () => {
  const clip = new Set([`${keyHost.primary}+c`, `${keyHost.primary}+x`, `${keyHost.primary}+v`]);
  const once = { repeat: false, clip };

  it('аккорд без команды — говорим', () => {
    expect(keyRules.complains(`${keyHost.primary}+j`, once)).toBe(true);
    expect(keyRules.complains(`${keyHost.primary}+shift+j`, once)).toBe(true);
  });

  it('другой наш модификатор тоже говорит: мы и его забрали', () => {
    const other = keyHost.primary === 'control' ? 'meta' : 'control';
    expect(keyRules.complains(`${other}+j`, once)).toBe(true);
  });

  it('Shift сам по себе аккорда не делает', () => {
    expect(keyRules.complains('shift+arrowleft', once)).toBe(false);
    expect(keyRules.complains('shift+k', once)).toBe(false);
  });

  it('голая клавиша это ввод, а не промах', () => {
    expect(keyRules.complains('k', once)).toBe(false);
    expect(keyRules.complains('escape', once)).toBe(false);
  });

  it('механика ввода редактора молчит', () => {
    for (const key of inputMechanics.keys(keyHost.isMac)) {
      if (!key.split('+').includes(keyHost.primary)) continue;
      expect(keyRules.complains(key, once), key).toBe(false);
    }
  });

  it('зажатая клавиша не бубнит', () => {
    expect(keyRules.complains(`${keyHost.primary}+j`, { repeat: true, clip })).toBe(false);
  });

  it('буфер обмена молчит, даже когда он на главном модификаторе', () => {
    expect(keyRules.complains(`${keyHost.primary}+c`, once)).toBe(false);
  });
});

describe('перехват чужих эффектов', () => {
  const clip = new Set([`${keyHost.primary}+c`, `${keyHost.primary}+v`]);

  it('аккорд с главным модификатором гасится, даже если не назначен', () => {
    expect(keyRules.swallows(`${keyHost.primary}+s`, clip)).toBe(true);
    expect(keyRules.swallows(`${keyHost.primary}+p`, clip)).toBe(true);
    expect(keyRules.swallows(`${keyHost.primary}+j`, clip)).toBe(true);
  });

  it('любой наш модификатор гасится, а не только главный', () => {
    for (const mod of ['meta', 'control', 'alt']) {
      expect(keyRules.swallows(`${mod}+j`, clip), mod).toBe(true);
    }
  });

  it('Shift сам по себе не аккорд: выделение остаётся выделением', () => {
    expect(keyRules.swallows('shift+arrowleft', clip)).toBe(false);
    expect(keyRules.swallows('shift+home', clip)).toBe(false);
  });

  it('буфер обмена и механика ввода не гасятся', () => {
    expect(keyRules.swallows(`${keyHost.primary}+c`, clip)).toBe(false);
    for (const key of inputMechanics.keys(keyHost.isMac)) {
      if (!key.split('+').includes(keyHost.primary)) continue;
      expect(keyRules.swallows(key, clip), key).toBe(false);
    }
  });

  it('голая клавиша это ввод, а не аккорд', () => {
    expect(keyRules.swallows('enter', clip)).toBe(false);
    expect(keyRules.swallows('k', clip)).toBe(false);
  });

  it('мягко отнятое гасится везде, даже мимо всех прочих правил', () => {
    const key = [...inputMechanics.keys(keyHost.isMac)][0]!;
    expect(keyRules.swallows(key, clip)).toBe(false);
    expect(keyRules.swallows(key, clip, { soft: new Set([key]) })).toBe(true);
  });

  it('оставленное браузеру не гасится: это клавиша выхода', () => {
    const left = new Set([`${keyHost.primary}+r`]);
    expect(keyRules.swallows(`${keyHost.primary}+r`, clip)).toBe(true);
    expect(keyRules.swallows(`${keyHost.primary}+r`, clip, { left })).toBe(false);
  });
});

describe('двойные модификаторы', () => {
  it('раскладка и человек называют клавишу одинаково', () => {
    expect(keyHost.humanize('double:meta')).toBe(keyHost.isMac ? 'Cmd Cmd' : 'Win Win');
    expect(keyHost.humanize('double:control')).toBe('Control Control');
    expect(keyHost.humanize('double:alt')).toBe(keyHost.isMac ? 'Option Option' : 'Alt Alt');
    expect(keyHost.humanize('double:shift')).toBe('Shift Shift');
  });

  it('все четыре модификатора заняты и заняты разным', () => {
    const doubles = keymap().bindings.filter((b) => b.key.startsWith('double:'));
    expect(doubles.map((b) => b.key).sort()).toEqual([
      'double:alt',
      'double:control',
      'double:meta',
      'double:shift',
    ]);
    expect(new Set(doubles.map((b) => b.command)).size).toBe(doubles.length);
  });

  it('двойной тап живёт там, где голый тап свободен', () => {
    for (const world of WORLDS) {
      const taken = new Set(reserved.hardIn([world.scope]).map((item) => item.key));
      const doubles = inWorld(keymap().bindings, world).filter((b) => b.key.startsWith('double:'));
      for (const binding of doubles) {
        expect(taken.has(binding.key.slice(7)), `${world.scope}: ${binding.key}`).toBe(false);
      }
      const keys = doubles.map((b) => b.key);
      expect(keys, world.scope).toContain('double:shift');
      expect(keys, world.scope).toContain('double:control');
    }
  });
});
