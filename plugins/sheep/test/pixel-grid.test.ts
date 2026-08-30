import { describe, expect, it } from 'vitest';
import { cell, setPixelRatio, snap } from '../src/pixel-grid.js';

describe('сетка физических пикселей', () => {
  it('край клетки попадает в целый физический пиксель', () => {
    for (const ratio of [1, 1.25, 1.5, 2, 2.5]) {
      for (const value of [0, 3, 7.4, 13.9, 100.3]) {
        const device = snap(value, ratio) * ratio;
        expect(Math.abs(device - Math.round(device)), `${ratio} × ${value}`).toBeLessThan(1e-9);
      }
    }
  });

  it('соседние клетки делят ровно один край — без щели и без нахлёста', () => {
    setPixelRatio(1.25);
    const drawn: Array<[number, number, number, number]> = [];
    const ctx = {
      fillRect: (x: number, y: number, w: number, h: number) => drawn.push([x, y, w, h]),
    } as unknown as CanvasRenderingContext2D;

    for (let i = 0; i < 8; i += 1) cell(ctx, 13.7 + i * 4, 0, 4, 4);

    for (let i = 1; i < drawn.length; i += 1) {
      const [prevX, , prevW] = drawn[i - 1]!;
      const [x] = drawn[i]!;
      expect(prevX + prevW, `клетка ${i} не сошлась с предыдущей`).toBeCloseTo(x, 10);
    }
    for (const [, , w, h] of drawn) {
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
    }
    setPixelRatio(1);
  });
});
