import { describe, expect, it } from 'vitest';
import { grouped, shiftMatches, type PickItem } from '../src/ui/pick-popup.js';

function row(id: string): { item: PickItem<string>; matches: number[] } {
  return { item: { key: id, text: id, value: id }, matches: [] };
}

const pkg = (id: string) => id.slice(0, id.lastIndexOf('::'));

describe('секции списка', () => {
  it('собирает соседей, не трогая порядок внутри', () => {
    const out = grouped(
      [row('a::one'), row('b::one'), row('a::two'), row('b::two')],
      pkg,
    ).map((found) => found.item.key);
    expect(out).toEqual(['a::one', 'a::two', 'b::one', 'b::two']);
  });

  it('секции идут в порядке своей ЛУЧШЕЙ строки', () => {
    const out = grouped([row('z::hit'), row('a::miss'), row('z::also')], pkg).map(
      (found) => found.item.key,
    );
    expect(out).toEqual(['z::hit', 'z::also', 'a::miss']);
  });
});

describe('подсветка под кусок строки', () => {
  it('сдвигает позиции и выбрасывает чужие', () => {
    expect(shiftMatches([6, 12, 13, 14], 12, 3)).toEqual([0, 1, 2]);
  });

  it('пустой список остаётся пустым', () => {
    expect(shiftMatches([], 5, 3)).toEqual([]);
  });
});
