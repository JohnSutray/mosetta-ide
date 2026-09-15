import { describe, expect, it } from 'vitest';
import { ColumnFit } from '../src/fit.js';

const fit = new ColumnFit(320, 1);
const three = [
  { id: 'terminal', width: 460, min: 240 },
  { id: 'debug', width: 340, min: 240 },
  { id: 'problems', width: 360, min: 200 },
];
const sum = (shown: Record<string, number>) => Object.values(shown).reduce((a, b) => a + b, 0);

describe('ужатие колонок ради середины', () => {
  it('влезает — ничего не трогаем', () => {
    expect(fit.fit(2000, three)).toEqual({ terminal: 460, debug: 340, problems: 360 });
  });

  it('не влезает — середине остаётся её минимум, боковые ужаты', () => {
    const shown = fit.fit(1440, three);
    expect(sum(shown)).toBe(1440 - 320 - 3);
    for (const column of three) expect(shown[column.id]).toBeGreaterThanOrEqual(column.min);
  });

  it('отдаёт пропорционально запасу: кто просил больше, тот больше и отдаёт', () => {
    const shown = fit.fit(1440, three);
    const gave = (id: string, width: number) => width - shown[id]!;
    expect(gave('terminal', 460)).toBeGreaterThan(gave('problems', 360));
    expect(gave('problems', 360)).toBeGreaterThan(gave('debug', 340));
  });

  it('ниже минимумов не ужимает — тогда середине достаётся меньше, и это честно', () => {
    const shown = fit.fit(900, three);
    expect(shown).toEqual({ terminal: 240, debug: 240, problems: 200 });
  });

  it('колонка без запаса ничего не отдаёт', () => {
    const shown = fit.fit(700, [
      { id: 'a', width: 200, min: 200 },
      { id: 'b', width: 400, min: 100 },
    ]);
    expect(shown).toEqual({ a: 200, b: 178 });
  });

  it('потолок перетаскивания считает соседей, а не только середину', () => {
    expect(fit.maxFor(1440, 'terminal', three)).toBe(1440 - 320 - 3 - 240 - 200);
    expect(fit.maxFor(2000, 'terminal', three)).toBe(2000 - 320 - 3 - 240 - 200);
  });

  it('ту, что тянут, показываем как просят — уступают соседи', () => {
    const shown = fit.fit(1440, three, 'terminal');
    expect(shown['terminal']).toBe(460);
    expect(sum(shown)).toBe(1440 - 320 - 3);
    expect(shown['debug']).toBeGreaterThanOrEqual(240);
    expect(shown['problems']).toBeGreaterThanOrEqual(200);
    expect(shown['debug']! + shown['problems']!).toBe(1117 - 460);
  });

  it('но не ниже минимумов соседей: просьба режется потолком', () => {
    const shown = fit.fit(1440, [{ ...three[0]!, width: 900 }, three[1]!, three[2]!], 'terminal');
    expect(shown).toEqual({ terminal: fit.maxFor(1440, 'terminal', three), debug: 240, problems: 200 });
  });

  it('неизвестный id в keep — обычное ужатие', () => {
    expect(fit.fit(1440, three, 'ghost')).toEqual(fit.fit(1440, three));
  });

  it('пустой список — пустой ответ', () => {
    expect(fit.fit(1440, [])).toEqual({});
  });
});
