import { describe, expect, it, vi } from 'vitest';
import { complains, eventToKey, resolveClip, typedIntoField } from '../src/keys/dispatcher.js';
import { CLIP } from '../src/keys/host.js';

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

describe('модификатор буфера обмена', () => {
  it('переписывается в тот модификатор, что есть в этом окружении', () => {
    expect(resolveClip('clip+c')).toBe(`${CLIP}+c`);
    expect(resolveClip('clip+shift+c')).toBe(`${CLIP}+shift+c`);
  });

  it('чужие биндинги не трогает', () => {
    expect(resolveClip('mod+s')).toBe('mod+s');
    expect(resolveClip('backspace')).toBe('backspace');
    expect(resolveClip('mod+clipboard')).toBe('mod+clipboard');
  });
});

describe('браузер на маке: Cmd+C доходит до дерева', () => {
  it('событие и биндинг сходятся в одной строке', async () => {
    vi.resetModules();
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/130', platform: 'MacIntel' });
    const { eventToKey, resolveClip: resolve } = await import('../src/keys/dispatcher.js');
    const { MOD_IS_META } = await import('../src/keys/host.js');
    expect(MOD_IS_META, 'в браузере ведущая клавиша — Control (ADR-0098)').toBe(false);

    const copy = press('c', ROW, { metaKey: true });
    expect(resolve('clip+c')).toBe('cmd+c');
    expect(eventToKey(copy)).toBe('cmd+c');

    const path = press('c', ROW, { metaKey: true, shiftKey: true });
    expect(eventToKey(path)).toBe(resolve('clip+shift+c'));

    expect(eventToKey(press('n', ROW, { ctrlKey: true }))).toBe('mod+n');
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});

describe('клавиша от клетки, а не от символа', () => {
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

  it('кириллица не отменяет сохранение', async () => {
    vi.resetModules();
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/130', platform: 'MacIntel' });
    const { eventToKey } = await import('../src/keys/dispatcher.js');
    expect(eventToKey(stroke('KeyS', 'ы', { ctrlKey: true }))).toBe('mod+s');
    expect(eventToKey(stroke('KeyS', 's', { ctrlKey: true }))).toBe('mod+s');
    vi.unstubAllGlobals();
    vi.resetModules();
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
    expect(eventToKey(stroke('', 'k', { ctrlKey: true }))).toBe('mod+k');
  });
});

describe('жалоба на клавишу без команды', () => {
  const clip = new Set(['cmd+c', 'cmd+x', 'cmd+v', 'cmd+shift+c']);
  const once = { repeat: false, clip };

  it('свой модификатор без команды — говорим', () => {
    expect(complains('mod+j', once)).toBe(true);
    expect(complains('mod+shift+j', once)).toBe(true);
  });

  it('чужие модификаторы молчат', () => {
    expect(complains('alt+space', once)).toBe(false);
    expect(complains('cmd+c', once)).toBe(false);
    expect(complains('alt+shift+arrowup', once)).toBe(false);
  });

  it('голая клавиша это ввод, а не промах', () => {
    expect(complains('k', once)).toBe(false);
    expect(complains('escape', once)).toBe(false);
  });

  it('механика ввода редактора молчит', () => {
    expect(complains('mod+arrowup', once)).toBe(false);
    expect(complains('mod+arrowdown', once)).toBe(false);
  });

  it('зажатая клавиша не бубнит', () => {
    expect(complains('mod+j', { repeat: true, clip })).toBe(false);
  });

  it('буфер обмена этой раскладки молчит, даже если он на `mod`', () => {
    expect(complains('mod+c', { repeat: false, clip: new Set(['mod+c']) })).toBe(false);
  });
});
