import { describe, expect, it } from 'vitest';
import { Terms } from '../src/query.js';

const terms = new Terms();

describe('разбор строки поиска', () => {
  it('последнее слово — терм, остальные — теги', () => {
    expect(terms.parse('ts function fit')).toEqual({ tags: ['ts', 'function'], term: 'fit' });
  });

  it('одно слово тегом не становится: его ещё дописывают', () => {
    expect(terms.parse('ts')).toEqual({ tags: [], term: 'ts' });
  });

  it('пробел в конце закрывает тег, терм пуст', () => {
    expect(terms.parse('ts ')).toEqual({ tags: ['ts'], term: '' });
  });

  it('регистр не значит, повторы схлопываются', () => {
    expect(terms.parse('TS ts Setting fit')).toEqual({ tags: ['ts', 'setting'], term: 'fit' });
  });

  it('пусто — пусто', () => {
    expect(terms.parse('')).toEqual({ tags: [], term: '' });
    expect(terms.parse('   ')).toEqual({ tags: [], term: '' });
  });

  it('сорт находки — тег без объявления', () => {
    expect(terms.keeps({ kind: 'ts' }, ['ts'])).toBe(true);
    expect(terms.keeps({ kind: 'file' }, ['ts'])).toBe(false);
  });

  it('теги складываются: подходит тот, у кого есть ВСЕ', () => {
    const hit = { kind: 'ts', tags: ['function'] };
    expect(terms.keeps(hit, ['ts', 'function'])).toBe(true);
    expect(terms.keeps(hit, ['ts', 'class'])).toBe(false);
  });

  it('без тегов подходит всё', () => {
    expect(terms.keeps({ kind: 'file' }, [])).toBe(true);
  });
});
