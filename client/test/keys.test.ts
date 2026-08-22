import { describe, expect, it, vi } from 'vitest';
import { resolveClip, typedIntoField } from '../src/keys/dispatcher.js';
import { CLIP } from '../src/keys/host.js';

function press(key: string, target: unknown, mods: Record<string, boolean> = {}) {
  return {
    key,
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
