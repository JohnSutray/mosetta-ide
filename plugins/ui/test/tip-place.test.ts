import { describe, expect, it } from 'vitest';
import { Tips, type TipSpot } from '../src/windows/tips.js';

/**
 * Where a tooltip stands.
 *
 * Arithmetic, hence a test: for a button in the bottom right corner the tooltip misses
 * with both coordinates at once — it runs into the right edge, collapses into a column
 * and slides off the bottom. By eye that is caught one time in three.
 */
const VIEW = { width: 800, height: 600 };
const TIP = { width: 200, height: 40 };

function spot(x: number, bottom: number, top = bottom - 30): TipSpot {
  return { x, y: bottom, above: top, title: 'the tooltip', keys: [] };
}

describe('the tooltip\'s place', () => {
  const tips = new Tips();

  it('the ordinary case: where it was asked for', () => {
    expect(tips.place(spot(100, 200), TIP, VIEW)).toEqual({ left: 100, top: 200 });
  });

  it('at the right edge it moves left rather than shrinking', () => {
    expect(tips.place(spot(780, 200), TIP, VIEW).left).toBe(592);
  });

  it('at the left edge and in a narrow window it does not stick to the edge', () => {
    expect(tips.place(spot(-40, 200), TIP, VIEW).left).toBe(8);
    expect(tips.place(spot(10, 200), TIP, { width: 120, height: 600 }).left).toBe(8);
  });

  it('it did not fit below — it stands ABOVE the element', () => {
    expect(tips.place(spot(100, 580, 550), TIP, VIEW).top).toBe(510);
  });

  it('it fits neither below nor above — it presses against the window\'s top', () => {
    expect(tips.place(spot(100, 595, 20), TIP, VIEW).top).toBe(8);
  });

  it('the window has not been measured yet — we leave it as asked rather than squeezing it into a corner', () => {
    expect(tips.place(spot(100, 200), TIP, { width: 0, height: 0 })).toEqual({ left: 100, top: 200 });
  });
});
