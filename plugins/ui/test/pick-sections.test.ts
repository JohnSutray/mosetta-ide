import { describe, expect, it } from 'vitest';
import { grouped, matches, type PickItem } from '../src/index.js';

/**
 * Sections in a list with search. Both checks are about what breaks silently: the
 * highlighting slipping onto the wrong letters, and the grouping scattering the order
 * by relevance.
 */

function row(id: string): { item: PickItem<string>; matches: number[] } {
  return { item: { key: id, text: id, value: id }, matches: [] };
}

const pkg = (id: string) => id.slice(0, id.lastIndexOf('::'));

describe('a list\'s sections', () => {
  it('it gathers neighbours without touching the order inside', () => {
    const out = grouped(
      [row('a::one'), row('b::one'), row('a::two'), row('b::two')],
      pkg,
    ).map((found) => found.item.key);
    expect(out).toEqual(['a::one', 'a::two', 'b::one', 'b::two']);
  });

  it('the sections go in the order of their BEST row', () => {
    const out = grouped([row('z::hit'), row('a::miss'), row('z::also')], pkg).map(
      (found) => found.item.key,
    );
    expect(out).toEqual(['z::hit', 'z::also', 'a::miss']);
  });
});

describe('highlighting over a piece of a row', () => {
  it('it shifts the positions and throws out the foreign ones', () => {
    expect(matches.shiftMatches([6, 12, 13, 14], 12, 3)).toEqual([0, 1, 2]);
  });

  it('an empty list stays empty', () => {
    expect(matches.shiftMatches([], 5, 3)).toEqual([]);
  });
});
