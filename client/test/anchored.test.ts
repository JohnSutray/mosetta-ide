import { describe, expect, it } from 'vitest';
import { geometry } from '@ide/windows';

const BOX = { w: 1600, h: 1000 };
const MIN = { w: 320, h: 220 };

function fit(want: { w: number; h: number }, y: number, x = 400) {
  return geometry.fitAnchored(want, { x, y }, BOX, MIN);
}

describe('попап у строки', () => {
  it('под кареткой, если желание влезает', () => {
    const at = fit({ w: 620, h: 420 }, 100);
    expect(at.top).toBeGreaterThan(100);
    expect(at.h).toBe(420);
    expect(at.w).toBe(620);
  });

  it('огромное желание у ВЕРХНЕГО края исполняется целиком', () => {
    const at = fit({ w: 1000, h: 900 }, 60);
    expect(at.h).toBe(900);
    expect(at.top + at.h).toBeLessThanOrEqual(BOX.h - geometry.edge);
  });

  it('у НИЖНЕГО края тот же попап уезжает наверх и ужимается', () => {
    const at = fit({ w: 1000, h: 950 }, 940);
    expect(at.top).toBe(geometry.edge);
    expect(at.h).toBe(940 - 6 - geometry.edge);
    expect(at.top + at.h).toBeLessThan(940);
  });

  it('желание не портится ужиманием: наверху оно снова исполняется', () => {
    const want = { w: 1000, h: 950 };
    const squeezed = fit(want, 940);
    expect(squeezed.h).toBeLessThan(want.h);
    expect(fit(want, 20).h).toBe(950);
  });

  it('ниже своего минимума не ужимается даже впритык к краю', () => {
    const at = fit({ w: 620, h: 420 }, BOX.h - 30);
    expect(at.h).toBeGreaterThanOrEqual(MIN.h);
  });

  it('от каждого края остаётся отступ', () => {
    for (const [x, y] of [
      [0, 0],
      [BOX.w, BOX.h],
      [BOX.w - 10, 30],
      [5, BOX.h - 5],
    ]) {
      const at = fit({ w: 1400, h: 900 }, y!, x!);
      expect(at.left, `${x},${y}`).toBeGreaterThanOrEqual(geometry.edge);
      expect(at.top, `${x},${y}`).toBeGreaterThanOrEqual(geometry.edge);
      expect(at.left + at.w, `${x},${y}`).toBeLessThanOrEqual(BOX.w - geometry.edge);
      expect(at.top + at.h, `${x},${y}`).toBeLessThanOrEqual(BOX.h - geometry.edge);
    }
  });

  it('на узком экране ширина режется, а не вылезает', () => {
    const at = geometry.fitAnchored({ w: 1200, h: 300 }, { x: 500, y: 100 }, { w: 800, h: 600 }, MIN);
    expect(at.w).toBe(800 - geometry.edge * 2);
    expect(at.left).toBe(geometry.edge);
  });
});
