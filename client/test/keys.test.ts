import { reserved } from '../src/keys/reserved.js';
import { describe, expect, it } from 'vitest';
import { complains, eventToKey, swallows, typedIntoField } from '../src/keys/dispatcher.js';
import { keyHost } from '../src/keys/host.js';
import { mechanicsKeys } from '../src/editor/input-keymap.js';
import { WORLDS, inWorld, keymap } from './keymap-shared.js';

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

const INPUT = { tagName: 'INPUT', isContentEditable: false };
const AREA = { tagName: 'TEXTAREA', isContentEditable: false };
const EDITOR = { tagName: 'DIV', isContentEditable: true };
const ROW = { tagName: 'DIV', isContentEditable: false };

describe('раскладка и поля ввода', () => {
  it('стирающие клавиши в поле принадлежат полю', () => {
    expect(typedIntoField(press('Backspace', INPUT))).toBe(true);
    expect(typedIntoField(press('Delete', AREA))).toBe(true);
    expect(typedIntoField(press('x', EDITOR))).toBe(true);
  });

  it('вне поля они достаются раскладке', () => {
    expect(typedIntoField(press('Backspace', ROW))).toBe(false);
    expect(typedIntoField(press('Backspace', null))).toBe(false);
  });

  it('аккорд с модификатором текстом не является', () => {
    expect(typedIntoField(press('s', INPUT, { metaKey: true }))).toBe(false);
    expect(typedIntoField(press('Backspace', INPUT, { altKey: true }))).toBe(false);
  });

  it('Enter, Escape и стрелки проходят: на них держатся списки с поиском', () => {
    expect(typedIntoField(press('Enter', INPUT))).toBe(false);
    expect(typedIntoField(press('Escape', INPUT))).toBe(false);
    expect(typedIntoField(press('ArrowDown', INPUT))).toBe(false);
  });
});

describe('строка нажатия', () => {
  it('модификаторы называются физически и всегда в одном порядке', () => {
    expect(eventToKey(stroke('KeyS', 's', { metaKey: true }))).toBe('meta+s');
    expect(eventToKey(stroke('KeyS', 's', { ctrlKey: true }))).toBe('control+s');
    expect(eventToKey(stroke('KeyS', 's', { altKey: true }))).toBe('alt+s');
    expect(
      eventToKey(
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
      expect(eventToKey(stroke('Digit1', '1', mods))).not.toMatch(/\b(mod|clip|cmd|ctrl)\b/);
    }
  });
});

describe('клавиша от клетки, а не от символа', () => {
  it('кириллица не отменяет сохранение', () => {
    expect(eventToKey(stroke('KeyS', 'ы', { ctrlKey: true }))).toBe('control+s');
    expect(eventToKey(stroke('KeyS', 's', { ctrlKey: true }))).toBe('control+s');
  });

  it('Option приходит собранным символом, а клетка остаётся прежней', () => {
    expect(eventToKey(stroke('Digit2', '™', { altKey: true }))).toBe('alt+2');
    expect(eventToKey(stroke('Digit3', '£', { altKey: true }))).toBe('alt+3');
  });

  it('клавиша под Escape одна в обеих раскладках', () => {
    expect(eventToKey(stroke('Backquote', '`'))).toBe('backquote');
    expect(eventToKey(stroke('Backquote', 'ё'))).toBe('backquote');
  });

  it('имена клавиш берутся из кода как есть', () => {
    expect(eventToKey(stroke('ArrowDown', 'ArrowDown'))).toBe('arrowdown');
    expect(eventToKey(stroke('Escape', 'Escape'))).toBe('escape');
    expect(eventToKey(stroke('Space', ' '))).toBe('space');
    expect(eventToKey(stroke('Slash', '.'))).toBe('slash');
  });

  it('голый модификатор клавишей не считается', () => {
    expect(eventToKey(stroke('ShiftLeft', 'Shift', { shiftKey: true }))).toBe(null);
  });

  it('без кода остаётся запасной путь по символу', () => {
    expect(eventToKey(stroke('', 'ё'))).toBe('backquote');
    expect(eventToKey(stroke('', 'k', { ctrlKey: true }))).toBe('control+k');
  });
});

describe('жалоба на клавишу без команды', () => {
  const clip = new Set([`${keyHost.primary}+c`, `${keyHost.primary}+x`, `${keyHost.primary}+v`]);
  const once = { repeat: false, clip };

  it('аккорд без команды — говорим', () => {
    expect(complains(`${keyHost.primary}+j`, once)).toBe(true);
    expect(complains(`${keyHost.primary}+shift+j`, once)).toBe(true);
  });

  it('другой наш модификатор тоже говорит: мы и его забрали', () => {
    const other = keyHost.primary === 'control' ? 'meta' : 'control';
    expect(complains(`${other}+j`, once)).toBe(true);
  });

  it('Shift сам по себе аккорда не делает', () => {
    expect(complains('shift+arrowleft', once)).toBe(false);
    expect(complains('shift+k', once)).toBe(false);
  });

  it('голая клавиша это ввод, а не промах', () => {
    expect(complains('k', once)).toBe(false);
    expect(complains('escape', once)).toBe(false);
  });

  it('механика ввода редактора молчит', () => {
    for (const key of mechanicsKeys(keyHost.isMac)) {
      if (!key.split('+').includes(keyHost.primary)) continue;
      expect(complains(key, once), key).toBe(false);
    }
  });

  it('зажатая клавиша не бубнит', () => {
    expect(complains(`${keyHost.primary}+j`, { repeat: true, clip })).toBe(false);
  });

  it('буфер обмена молчит, даже когда он на главном модификаторе', () => {
    expect(complains(`${keyHost.primary}+c`, once)).toBe(false);
  });
});

describe('перехват чужих эффектов', () => {
  const clip = new Set([`${keyHost.primary}+c`, `${keyHost.primary}+v`]);

  it('аккорд с главным модификатором гасится, даже если не назначен', () => {
    expect(swallows(`${keyHost.primary}+s`, clip)).toBe(true);
    expect(swallows(`${keyHost.primary}+p`, clip)).toBe(true);
    expect(swallows(`${keyHost.primary}+j`, clip)).toBe(true);
  });

  it('любой наш модификатор гасится, а не только главный', () => {
    for (const mod of ['meta', 'control', 'alt']) {
      expect(swallows(`${mod}+j`, clip), mod).toBe(true);
    }
  });

  it('Shift сам по себе не аккорд: выделение остаётся выделением', () => {
    expect(swallows('shift+arrowleft', clip)).toBe(false);
    expect(swallows('shift+home', clip)).toBe(false);
  });

  it('буфер обмена и механика ввода не гасятся', () => {
    expect(swallows(`${keyHost.primary}+c`, clip)).toBe(false);
    for (const key of mechanicsKeys(keyHost.isMac)) {
      if (!key.split('+').includes(keyHost.primary)) continue;
      expect(swallows(key, clip), key).toBe(false);
    }
  });

  it('голая клавиша это ввод, а не аккорд', () => {
    expect(swallows('enter', clip)).toBe(false);
    expect(swallows('k', clip)).toBe(false);
  });

  it('мягко отнятое гасится везде, даже мимо всех прочих правил', () => {
    const key = [...mechanicsKeys(keyHost.isMac)][0]!;
    expect(swallows(key, clip)).toBe(false);
    expect(swallows(key, clip, { soft: new Set([key]) })).toBe(true);
  });

  it('оставленное браузеру не гасится: это клавиша выхода', () => {
    const left = new Set([`${keyHost.primary}+r`]);
    expect(swallows(`${keyHost.primary}+r`, clip)).toBe(true);
    expect(swallows(`${keyHost.primary}+r`, clip, { left })).toBe(false);
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
