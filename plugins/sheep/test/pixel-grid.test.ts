import { describe, expect, it } from 'vitest';
import { pixelGrid } from '../src/pixel-grid.js';

/**
 * The seams between cells. Checked by arithmetic, because by eye this is visible only
 * on a screen with a fractional scale — that is, on Windows at 125%, where I do not go.
 */
describe('the grid of physical pixels', () => {
  it('a cell\'s edge lands on a whole physical pixel', () => {
    for (const ratio of [1, 1.25, 1.5, 2, 2.5]) {
      for (const value of [0, 3, 7.4, 13.9, 100.3]) {
        const device = pixelGrid.snap(value, ratio) * ratio;
        expect(Math.abs(device - Math.round(device)), `${ratio} × ${value}`).toBeLessThan(1e-9);
      }
    }
  });

  it('neighbouring cells share exactly one edge — no gap and no overlap', () => {
    pixelGrid.setRatio(1.25);
    const drawn: Array<[number, number, number, number]> = [];
    const ctx = {
      fillRect: (x: number, y: number, w: number, h: number) => drawn.push([x, y, w, h]),
    } as unknown as CanvasRenderingContext2D;

    for (let i = 0; i < 8; i += 1) pixelGrid.cell(ctx, 13.7 + i * 4, 0, 4, 4);

    for (let i = 1; i < drawn.length; i += 1) {
      const [prevX, , prevW] = drawn[i - 1]!;
      const [x] = drawn[i]!;
      expect(prevX + prevW, `cell ${i} did not meet the previous one`).toBeCloseTo(x, 10);
    }
    for (const [, , w, h] of drawn) {
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
    }
    pixelGrid.setRatio(1);
  });
});
