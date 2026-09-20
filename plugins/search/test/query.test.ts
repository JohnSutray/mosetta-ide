import { describe, expect, it } from 'vitest';
import { Terms } from '../src/query.js';

/**
 * Tags in the search line.
 *
 * The user's thought: `ts::` in front of a symbol hinted where the hit came from — so
 * the same thing can be typed. Words separated by spaces read as marks, and the last
 * word stays the term.
 */
const terms = new Terms();

describe('parsing the search line', () => {
  it('the last word is the term, the rest are tags', () => {
    expect(terms.parse('ts function fit')).toEqual({ tags: ['ts', 'function'], term: 'fit' });
  });

  it('one word does not become a tag: it is still being typed', () => {
    expect(terms.parse('ts')).toEqual({ tags: [], term: 'ts' });
  });

  it('a trailing space closes the tag, and the term is empty', () => {
    expect(terms.parse('ts ')).toEqual({ tags: ['ts'], term: '' });
  });

  it('case does not matter, duplicates collapse', () => {
    expect(terms.parse('TS ts Setting fit')).toEqual({ tags: ['ts', 'setting'], term: 'fit' });
  });

  it('empty means empty', () => {
    expect(terms.parse('')).toEqual({ tags: [], term: '' });
    expect(terms.parse('   ')).toEqual({ tags: [], term: '' });
  });

  it('a hit\'s kind is a tag with no declaration', () => {
    expect(terms.keeps({ kind: 'ts' }, ['ts'])).toBe(true);
    expect(terms.keeps({ kind: 'file' }, ['ts'])).toBe(false);
  });

  it('tags add up: whoever has ALL of them fits', () => {
    const hit = { kind: 'ts', tags: ['function'] };
    expect(terms.keeps(hit, ['ts', 'function'])).toBe(true);
    expect(terms.keeps(hit, ['ts', 'class'])).toBe(false);
  });

  it('with no tags everything fits', () => {
    expect(terms.keeps({ kind: 'file' }, [])).toBe(true);
  });
});
