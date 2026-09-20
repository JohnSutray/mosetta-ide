import { describe, expect, it } from 'vitest';
import { Visits } from '../src/state.js';
import type { Visit } from '../src/types.js';

/** The list is a pure method: it needs no server, so we substitute a silent one. */
const visits = new Visits({ list: async () => [], save: async () => ({ saved: 0 }) }, () => ({ goTo: async () => undefined }));

/**
 * The caret history. The rules are delicate and break silently: "back" starts unwinding
 * line by line or, conversely, stops returning at all.
 */
const FAR = 12;
const LIMIT = 30;

function push(list: Visit[], at: number, path: string, line: number, character = 0) {
  return visits.next(list, at, path, line, character, FAR, LIMIT);
}

describe('the list of visits', () => {
  it('the first place is recorded', () => {
    const out = push([], -1, 'a.ts', 10, 4)!;
    expect(out.list).toEqual([{ path: 'a.ts', line: 10, character: 4 }]);
    expect(out.at).toBe(0);
  });

  it('moving through the text nearby does not count as a visit', () => {
    const list = [{ path: 'a.ts', line: 10, character: 0 }];
    expect(push(list, 0, 'a.ts', 10)).toBe(null);
    const out = push(list, 0, 'a.ts', 14, 7)!;
    expect(out.list).toEqual([{ path: 'a.ts', line: 14, character: 7 }]);
    expect(out.at).toBe(0);
  });

  it('the column is refined without starting a new visit', () => {
    const list = [{ path: 'a.ts', line: 10, character: 0 }];
    const out = push(list, 0, 'a.ts', 10, 12)!;
    expect(out.list).toEqual([{ path: 'a.ts', line: 10, character: 12 }]);
    expect(out.at).toBe(0);
  });

  it('a distant line of the same file is a new visit', () => {
    const out = push([{ path: 'a.ts', line: 10 }], 0, 'a.ts', 200)!;
    expect(out.list).toHaveLength(2);
    expect(out.at).toBe(1);
  });

  it('another file is always a new visit, even line for line', () => {
    const out = push([{ path: 'a.ts', line: 10 }], 0, 'b.ts', 10)!;
    expect(out.list).toHaveLength(2);
  });

  it('a new visit cuts off whatever was "forward"', () => {
    const list = [
      { path: 'a.ts', line: 1 },
      { path: 'b.ts', line: 1 },
      { path: 'c.ts', line: 1 },
    ];
    const out = push(list, 0, 'd.ts', 1)!;
    expect(out.list.map((item) => item.path)).toEqual(['a.ts', 'd.ts']);
    expect(out.at).toBe(1);
  });

  it('the length does not grow forever', () => {
    let list: Visit[] = [];
    let at = -1;
    for (let n = 0; n < LIMIT * 2; n += 1) {
      const out = push(list, at, `f${n}.ts`, 0)!;
      list = out.list;
      at = out.at;
    }
    expect(list).toHaveLength(LIMIT);
    expect(list.at(-1)!.path).toBe(`f${LIMIT * 2 - 1}.ts`);
  });
});

/**
 * Recent FILES are not the same as the caret history: one file lies in that as many
 * rows as there were places jumped to inside it.
 */
describe('recent files', () => {
  const of = (list: Visit[]) => {
    const own = new Visits({ list: async () => [], save: async () => ({ saved: 0 }) }, () => ({ goTo: async () => undefined }));
    own.list.value = list;
    return own;
  };

  it('freshest first, each file once', () => {
    const own = of([
      { path: 'a.ts', line: 1 },
      { path: 'b.ts', line: 2 },
      { path: 'a.ts', line: 90 },
      { path: 'c.ts', line: 3 },
    ]);
    expect(own.recentFiles(10)).toEqual([
      { path: 'c.ts', line: 3 },
      { path: 'a.ts', line: 90 },
      { path: 'b.ts', line: 2 },
    ]);
  });

  it('the LAST line is taken: one returns to where one left off', () => {
    const own = of([
      { path: 'a.ts', line: 1 },
      { path: 'a.ts', line: 200 },
    ]);
    expect(own.recentFiles(10)).toEqual([{ path: 'a.ts', line: 200 }]);
  });

  it('we hand over no more than was asked for, and zero switches the list off entirely', () => {
    const own = of([
      { path: 'a.ts', line: 1 },
      { path: 'b.ts', line: 2 },
      { path: 'c.ts', line: 3 },
    ]);
    expect(own.recentFiles(2).map((one) => one.path)).toEqual(['c.ts', 'b.ts']);
    expect(own.recentFiles(0)).toEqual([]);
  });
});
