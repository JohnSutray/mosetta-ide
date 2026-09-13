import { describe, expect, it } from 'vitest';
import { KeymapOrder } from '../src/order.js';
import { FACTORY_KEYMAP } from '../src/keymap.js';
import type { KeyBinding, KeyContext } from '../src/types.js';

const order = new KeymapOrder();

function row(command: string, when?: KeyContext): KeyBinding {
  return { command, key: 'meta+k', ...(when ? { when } : {}) };
}

describe('порядок строк раскладки', () => {
  it('глобальные — первыми: они работают везде', () => {
    const sorted = order.sort([row('a', 'terminal'), row('b'), row('c', 'editor')]);
    expect(sorted.map((one) => one.command)).toEqual(['b', 'c', 'a']);
  });

  it('внутри поверхности порядок поставки не трогаем', () => {
    const sorted = order.sort([row('a', 'editor'), row('b', 'tree'), row('c', 'editor')]);
    expect(sorted.map((one) => one.command)).toEqual(['a', 'c', 'b']);
  });

  it('незнакомая поверхность уезжает в конец, а не теряется', () => {
    const sorted = order.sort([row('a', 'выдумка' as KeyContext), row('b', 'editor')]);
    expect(sorted.map((one) => one.command)).toEqual(['b', 'a']);
  });

  it('на настоящей поставке: ни одной строки не потеряно и группы целы', () => {
    const sorted = order.sort(FACTORY_KEYMAP.bindings);
    expect(sorted).toHaveLength(FACTORY_KEYMAP.bindings.length);
    const ranks = sorted.map((one) => order.rank(one.when));
    expect(ranks, 'ранги идут не убывая — значит группы не разорваны').toEqual([...ranks].sort((a, b) => a - b));
  });

  it('в выборе поверхности нет `global`: «везде» — это пустой контекст', () => {
    expect(order.pickable).not.toContain('global');
    expect(order.contexts[0]).toBe('global');
  });
});
