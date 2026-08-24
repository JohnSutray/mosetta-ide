import { describe, expect, it } from 'vitest';
import { defaultChoices, diff3 } from '../src/merge/diff3.js';
import { layout } from '../src/merge/layout.js';

const lines = (...items: string[]) => `${items.join('\n')}\n`;

function rowsOf(lane: { text: string; pads: Array<{ rows: number }> }): number {
  const own = lane.text === '' ? 1 : lane.text.split('\n').length;
  return own + lane.pads.reduce((sum, item) => sum + item.rows, 0);
}

describe('раскладка трёх колонок', () => {
  it('колонки одной высоты, что бы ни было в участках', () => {
    const base = lines('a', 'b', 'c');
    const left = lines('a', 'левое-1', 'левое-2', 'левое-3', 'c');
    const right = lines('a', 'правое', 'c');

    const regions = diff3(base, left, right);
    const grid = layout(regions, defaultChoices(regions));

    expect(rowsOf(grid.left)).toBe(grid.rows);
    expect(rowsOf(grid.center)).toBe(grid.rows);
    expect(rowsOf(grid.right)).toBe(grid.rows);
  });

  it('участок начинается в трёх колонках на одной клетке', () => {
    const base = lines('1', '2', '3', '4', '5');
    const left = lines('1', 'два-а', 'два-б', '3', '4', '5');
    const right = lines('1', '2', '3', 'ЧЕТЫРЕ', '5');

    const regions = diff3(base, left, right);
    const grid = layout(regions, defaultChoices(regions));

    const cellOf = (lane: 'left' | 'center' | 'right', region: number): number => {
      const band = grid[lane].bands.find((item) => item.region === region)!;
      const padded = grid[lane].pads
        .filter((item) => item.line < band.from)
        .reduce((sum, item) => sum + item.rows, 0);
      return band.from + padded;
    };

    grid.spots.forEach((spot) => {
      expect(cellOf('left', spot.region), `участок ${spot.region} слева`).toBe(spot.top);
      expect(cellOf('center', spot.region), `участок ${spot.region} в центре`).toBe(spot.top);
      expect(cellOf('right', spot.region), `участок ${spot.region} справа`).toBe(spot.top);
    });
  });

  it('пустая колонка не длиннее соседей на невидимую строку', () => {
    const base = lines('a', 'b');
    const regions = diff3(base, '', base);
    const grid = layout(regions, defaultChoices(regions));

    expect(rowsOf(grid.left)).toBe(grid.rows);
    expect(rowsOf(grid.right)).toBe(grid.rows);
  });

  it('центр растёт, когда взяли обе стороны спора', () => {
    const base = lines('a', 'b', 'c');
    const regions = diff3(base, lines('a', 'моё', 'c'), lines('a', 'чужое', 'c'));

    const one = layout(regions, [
      { left: null, right: null },
      { left: 'take', right: 'skip' },
      { left: null, right: null },
    ]);
    const two = layout(regions, [
      { left: null, right: null },
      { left: 'take', right: 'take' },
      { left: null, right: null },
    ]);

    expect(two.rows).toBe(one.rows + 1);
    expect(rowsOf(two.left)).toBe(two.rows);
    expect(rowsOf(two.right)).toBe(two.rows);
  });
});
