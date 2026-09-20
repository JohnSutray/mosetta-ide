import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals';
import { Geometry } from '../src/windows/geometry.js';

const geometry = new Geometry(<T>(_key: string, initial: T) => signal(initial), { value: { w: 1280, h: 720 } });

/**
 * A popup holding on to a line of code.
 *
 * The rule reads as a promise: **we remember the wish and show as much as fits.** It is
 * checked by the user's scenario whole — that is how they described it, step by step.
 */

const BOX = { w: 1600, h: 1000 };
const MIN = { w: 320, h: 220 };

/** The place the popup landed in, and its size. */
function fit(want: { w: number; h: number }, y: number, x = 400) {
  return geometry.fitAnchored(want, { x, y }, BOX, MIN);
}

describe('a popup next to a row', () => {
  it('below the caret, if the wish fits', () => {
    const at = fit({ w: 620, h: 420 }, 100);
    expect(at.top).toBeGreaterThan(100);
    expect(at.h).toBe(420);
    expect(at.w).toBe(620);
  });

  it('a huge wish at the TOP edge is granted whole', () => {
    const at = fit({ w: 1000, h: 900 }, 60);
    expect(at.h).toBe(900);
    expect(at.top + at.h).toBeLessThanOrEqual(BOX.h - geometry.edge);
  });

  it('at the BOTTOM edge the same popup moves up and is squeezed', () => {
    const at = fit({ w: 1000, h: 950 }, 940);
    expect(at.top).toBe(geometry.edge);
    expect(at.h).toBe(940 - 6 - geometry.edge);
    expect(at.top + at.h).toBeLessThan(940);
  });

  it('the wish is not spoiled by the squeezing: at the top it is granted again', () => {
    const want = { w: 1000, h: 950 };
    const squeezed = fit(want, 940);
    expect(squeezed.h).toBeLessThan(want.h);
    expect(fit(want, 20).h).toBe(950);
  });

  it('it does not squeeze below its own minimum, even flush against the edge', () => {
    const at = fit({ w: 620, h: 420 }, BOX.h - 30);
    expect(at.h).toBeGreaterThanOrEqual(MIN.h);
  });

  it('a margin is left from every edge', () => {
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

  it('on a narrow screen the width is cut rather than sticking out', () => {
    const at = geometry.fitAnchored({ w: 1200, h: 300 }, { x: 500, y: 100 }, { w: 800, h: 600 }, MIN);
    expect(at.w).toBe(800 - geometry.edge * 2);
    expect(at.left).toBe(geometry.edge);
  });
});
