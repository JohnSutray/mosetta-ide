import { LineDiff } from '@mosetta/ide-plugin-code';
import { Diff3 } from '../src/diff3.js';
import { describe, expect, it } from 'vitest';
import { layout } from '../src/layout.js';

const diff3 = new Diff3(() => new LineDiff());

/**
 * Aligning the columns.
 *
 * We check exactly one promise, but unconditionally: a hunk's line in the left column
 * is always opposite the same hunk's line in the right one. Without that, the
 * three-column view lies the louder the bigger the file.
 */

const lines = (...items: string[]) => `${items.join('\n')}\n`;

/** How many cells a column takes: the text's rows plus the spacers. */
function rowsOf(lane: { text: string; pads: Array<{ rows: number }> }): number {
  const own = lane.text === '' ? 1 : lane.text.split('\n').length;
  return own + lane.pads.reduce((sum, item) => sum + item.rows, 0);
}

describe('the three-column layout', () => {
  it('the columns are the same height, whatever is in the hunks', () => {
    const base = lines('a', 'b', 'c');
    const left = lines('a', 'left-1', 'left-2', 'left-3', 'c');
    const right = lines('a', 'right', 'c');

    const regions = diff3.regions(base, left, right);
    const grid = layout(regions, diff3.defaultChoices(regions), diff3);

    expect(rowsOf(grid.left)).toBe(grid.rows);
    expect(rowsOf(grid.center)).toBe(grid.rows);
    expect(rowsOf(grid.right)).toBe(grid.rows);
  });

  it('a hunk starts on the same cell in all three columns', () => {
    const base = lines('1', '2', '3', '4', '5');
    const left = lines('1', 'two-a', 'two-b', '3', '4', '5');
    const right = lines('1', '2', '3', 'FOUR', '5');

    const regions = diff3.regions(base, left, right);
    const grid = layout(regions, diff3.defaultChoices(regions), diff3);

    const cellOf = (lane: 'left' | 'center' | 'right', region: number): number => {
      const band = grid[lane].bands.find((item) => item.region === region)!;
      const padded = grid[lane].pads
        .filter((item) => item.line < band.from)
        .reduce((sum, item) => sum + item.rows, 0);
      return band.from + padded;
    };

    grid.spots.forEach((spot) => {
      expect(cellOf('left', spot.region), `hunk ${spot.region} on the left`).toBe(spot.top);
      expect(cellOf('center', spot.region), `hunk ${spot.region} in the middle`).toBe(spot.top);
      expect(cellOf('right', spot.region), `hunk ${spot.region} on the right`).toBe(spot.top);
    });
  });

  it('an empty column is not longer than its neighbours by an invisible row', () => {
    const base = lines('a', 'b');
    const regions = diff3.regions(base, '', base);
    const grid = layout(regions, diff3.defaultChoices(regions), diff3);

    expect(rowsOf(grid.left)).toBe(grid.rows);
    expect(rowsOf(grid.right)).toBe(grid.rows);
  });

  it('the middle grows when both sides of an argument were taken', () => {
    const base = lines('a', 'b', 'c');
    const regions = diff3.regions(base, lines('a', 'mine', 'c'), lines('a', 'theirs', 'c'));

    const one = layout(regions, [
      { left: null, right: null },
      { left: 'take', right: 'skip' },
      { left: null, right: null },
    ], diff3);
    const two = layout(regions, [
      { left: null, right: null },
      { left: 'take', right: 'take' },
      { left: null, right: null },
    ], diff3);

    expect(two.rows).toBe(one.rows + 1);
    expect(rowsOf(two.left)).toBe(two.rows);
    expect(rowsOf(two.right)).toBe(two.rows);
  });
});
