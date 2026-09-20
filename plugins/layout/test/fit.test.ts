import { describe, expect, it } from 'vitest';
import { ColumnFit } from '../src/fit.js';

/**
 * The middle is not squeezed to zero. The numbers come from the symptom: a terminal at
 * 460, debug at 340, problems at 360 on 1440 px — the editor was left with 280 minus
 * the strips, and with the tree on the left, with nothing.
 */
const fit = new ColumnFit(320, 1);
const three = [
  { id: 'terminal', width: 460, min: 240 },
  { id: 'debug', width: 340, min: 240 },
  { id: 'problems', width: 360, min: 200 },
];
const sum = (shown: Record<string, number>) => Object.values(shown).reduce((a, b) => a + b, 0);

describe('squeezing the columns for the middle\'s sake', () => {
  it('it fits — we touch nothing', () => {
    expect(fit.fit(2000, three)).toEqual({ terminal: 460, debug: 340, problems: 360 });
  });

  it('it does not fit — the middle keeps its minimum and the sides are squeezed', () => {
    const shown = fit.fit(1440, three);
    expect(sum(shown)).toBe(1440 - 320 - 3);
    for (const column of three) expect(shown[column.id]).toBeGreaterThanOrEqual(column.min);
  });

  it('each gives up in proportion to its slack: whoever asked for more gives up more', () => {
    const shown = fit.fit(1440, three);
    const gave = (id: string, width: number) => width - shown[id]!;
    expect(gave('terminal', 460)).toBeGreaterThan(gave('problems', 360));
    expect(gave('problems', 360)).toBeGreaterThan(gave('debug', 340));
  });

  it('it does not squeeze below the minimums — the middle then gets less, and that is honest', () => {
    const shown = fit.fit(900, three);
    expect(shown).toEqual({ terminal: 240, debug: 240, problems: 200 });
  });

  it('a column with no slack gives up nothing', () => {
    const shown = fit.fit(700, [
      { id: 'a', width: 200, min: 200 },
      { id: 'b', width: 400, min: 100 },
    ]);
    expect(shown).toEqual({ a: 200, b: 178 });
  });

  it('the drag ceiling counts the neighbours rather than only the middle', () => {
    expect(fit.maxFor(1440, 'terminal', three)).toBe(1440 - 320 - 3 - 240 - 200);
    expect(fit.maxFor(2000, 'terminal', three)).toBe(2000 - 320 - 3 - 240 - 200);
  });

  it('the one being dragged is shown as it asks — the neighbours give way', () => {
    const shown = fit.fit(1440, three, 'terminal');
    expect(shown['terminal']).toBe(460);
    expect(sum(shown)).toBe(1440 - 320 - 3);
    expect(shown['debug']).toBeGreaterThanOrEqual(240);
    expect(shown['problems']).toBeGreaterThanOrEqual(200);
    expect(shown['debug']! + shown['problems']!).toBe(1117 - 460);
  });

  it('but not below the neighbours\' minimums: the request is cut by the ceiling', () => {
    const shown = fit.fit(1440, [{ ...three[0]!, width: 900 }, three[1]!, three[2]!], 'terminal');
    expect(shown).toEqual({ terminal: fit.maxFor(1440, 'terminal', three), debug: 240, problems: 200 });
  });

  it('an unknown id in keep — an ordinary squeeze', () => {
    expect(fit.fit(1440, three, 'ghost')).toEqual(fit.fit(1440, three));
  });

  it('an empty list — an empty answer', () => {
    expect(fit.fit(1440, [])).toEqual({});
  });
});
