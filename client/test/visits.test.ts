import { visits } from '../src/state/visits.js';
import { describe, expect, it } from 'vitest';
import type { Visit } from '@ide/protocol';

const FAR = 12;
const LIMIT = 30;

function push(list: Visit[], at: number, path: string, line: number, character = 0) {
  return visits.next(list, at, path, line, character, FAR, LIMIT);
}

describe('список посещений', () => {
  it('первое место записывается', () => {
    const out = push([], -1, 'a.ts', 10, 4)!;
    expect(out.list).toEqual([{ path: 'a.ts', line: 10, character: 4 }]);
    expect(out.at).toBe(0);
  });

  it('движение по тексту рядом визитом не считается', () => {
    const list = [{ path: 'a.ts', line: 10, character: 0 }];
    expect(push(list, 0, 'a.ts', 10)).toBe(null);
    const out = push(list, 0, 'a.ts', 14, 7)!;
    expect(out.list).toEqual([{ path: 'a.ts', line: 14, character: 7 }]);
    expect(out.at).toBe(0);
  });

  it('колонка уточняется, не заводя нового визита (ADR-0121)', () => {
    const list = [{ path: 'a.ts', line: 10, character: 0 }];
    const out = push(list, 0, 'a.ts', 10, 12)!;
    expect(out.list).toEqual([{ path: 'a.ts', line: 10, character: 12 }]);
    expect(out.at).toBe(0);
  });

  it('далёкая строка того же файла — новый визит', () => {
    const out = push([{ path: 'a.ts', line: 10 }], 0, 'a.ts', 200)!;
    expect(out.list).toHaveLength(2);
    expect(out.at).toBe(1);
  });

  it('другой файл — всегда новый визит, даже строка в строку', () => {
    const out = push([{ path: 'a.ts', line: 10 }], 0, 'b.ts', 10)!;
    expect(out.list).toHaveLength(2);
  });

  it('новый визит обрезает то, что было «вперёд»', () => {
    const list = [
      { path: 'a.ts', line: 1 },
      { path: 'b.ts', line: 1 },
      { path: 'c.ts', line: 1 },
    ];
    const out = push(list, 0, 'd.ts', 1)!;
    expect(out.list.map((item) => item.path)).toEqual(['a.ts', 'd.ts']);
    expect(out.at).toBe(1);
  });

  it('длина не растёт бесконечно', () => {
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
