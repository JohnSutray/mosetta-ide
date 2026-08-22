import { describe, expect, it } from 'vitest';
import { typedIntoField } from '../src/keys/dispatcher.js';

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
