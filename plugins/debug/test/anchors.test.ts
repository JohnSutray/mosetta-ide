import { describe, expect, it } from 'vitest';
import { Anchors } from '../src/anchors.js';

const anchors = new Anchors();

function finder(lines: string[]) {
  return (line: number) => lines[line - 1] ?? '';
}

describe('якорь точки', () => {
  it('помнит текст без отступов: форматтер сдвинул — место то же', () => {
    expect(anchors.of('    return value;  ')).toBe('return value;');
  });

  it('на своём месте — там и остаётся', () => {
    const lines = ['a', 'return value;', 'c'];
    expect(anchors.find(finder(lines), lines.length, 'return value;', 2)).toBe(2);
  });

  it('строка уехала вниз — точка едет за ней', () => {
    const lines = ['a', 'b', 'c', 'return value;', 'e'];
    expect(anchors.find(finder(lines), lines.length, 'return value;', 2)).toBe(4);
  });

  it('строка уехала вверх — тоже находится', () => {
    const lines = ['return value;', 'b', 'c', 'd'];
    expect(anchors.find(finder(lines), lines.length, 'return value;', 4)).toBe(1);
  });

  it('одинаковых много — берётся БЛИЖАЙШАЯ, а не первая', () => {
    const lines = ['}', 'a', 'b', 'c', '}', 'd'];
    expect(anchors.find(finder(lines), lines.length, '}', 4)).toBe(5);
    expect(anchors.find(finder(lines), lines.length, '}', 2)).toBe(1);
  });

  it('на равном расстоянии берётся верхняя — правило одно, а не «как повезёт»', () => {
    const lines = ['x', '}', 'near', '}', 'y'];
    expect(anchors.find(finder(lines), lines.length, '}', 3)).toBe(2);
  });

  it('не нашлось — номер остаётся прежним: молча выбрасывать точку нельзя', () => {
    const lines = ['a', 'b', 'c'];
    expect(anchors.find(finder(lines), lines.length, 'return value;', 2)).toBe(2);
  });

  it('пустой якорь не ищем вовсе: любая пустая строка совпала бы', () => {
    const lines = ['a', '', 'c', ''];
    expect(anchors.find(finder(lines), lines.length, '', 3)).toBe(3);
  });

  it('файл стал короче — номер прижимается к последней строке', () => {
    const lines = ['a', 'b'];
    expect(anchors.find(finder(lines), lines.length, 'return value;', 9)).toBe(2);
  });
});
