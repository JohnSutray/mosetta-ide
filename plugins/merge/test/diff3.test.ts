import { LineDiff } from '@mosetta/ide-plugin-code';
import { Diff3, type Region } from '../src/diff3.js';

const diff3 = new Diff3(() => new LineDiff());
import { describe, expect, it } from 'vitest';

/**
 * Three-way merging.
 *
 * We check not "the function returned something" but the four questions it was written
 * for: where the argument is real, where it is imaginary, what merges in by itself, and
 * what comes out at the end.
 */

const lines = (...items: string[]) => `${items.join('\n')}\n`;
const kinds = (regions: Region[]) => regions.map((region) => region.kind);

describe('diff3', () => {
  it('nobody touched it — one hunk and not one decision', () => {
    const base = lines('a', 'b', 'c');
    const regions = diff3.regions(base, base, base);
    expect(kinds(regions)).toEqual(['same']);
    expect(diff3.allDecided(regions, diff3.defaultChoices(regions))).toBe(true);
    expect(diff3.buildText(regions, diff3.defaultChoices(regions))).toBe(base);
  });

  it('the sides touched DIFFERENT places — both changes merge in by themselves', () => {
    const base = lines('a', 'b', 'c', 'd', 'e');
    const left = lines('A', 'b', 'c', 'd', 'e');
    const right = lines('a', 'b', 'c', 'd', 'E');

    const regions = diff3.regions(base, left, right);
    expect(kinds(regions)).toEqual(['left', 'same', 'right']);

    const choices = diff3.defaultChoices(regions);
    expect(diff3.allDecided(regions, choices)).toBe(true);
    expect(diff3.buildText(regions, choices)).toBe(lines('A', 'b', 'c', 'd', 'E'));
  });

  it('the sides touched ONE place differently — that is an argument', () => {
    const base = lines('a', 'b', 'c');
    const left = lines('a', 'LEFT', 'c');
    const right = lines('a', 'RIGHT', 'c');

    const regions = diff3.regions(base, left, right);
    expect(kinds(regions)).toEqual(['same', 'conflict', 'same']);

    const choices = diff3.defaultChoices(regions);
    expect(diff3.allDecided(regions, choices)).toBe(false);

    choices[1] = { left: 'take', right: null };
    expect(diff3.allDecided(regions, choices)).toBe(true);
    expect(diff3.buildText(regions, choices)).toBe(left);

    choices[1] = { left: null, right: 'take' };
    expect(diff3.buildText(regions, choices)).toBe(right);

    choices[1] = { left: 'take', right: 'take' };
    expect(diff3.buildText(regions, choices)).toBe(lines('a', 'LEFT', 'RIGHT', 'c'));

    choices[1] = { left: 'skip', right: null };
    expect(diff3.allDecided(regions, choices)).toBe(false);
    choices[1] = { left: 'skip', right: 'skip' };
    expect(diff3.allDecided(regions, choices)).toBe(true);
    expect(diff3.buildText(regions, choices)).toBe(lines('a', 'c'));
  });

  it('the SAME edit from both sides — agreement rather than an argument', () => {
    const base = lines('a', 'b', 'c');
    const same = lines('a', 'BOTH', 'c');

    const regions = diff3.regions(base, same, same);
    expect(kinds(regions)).toEqual(['same', 'both', 'same']);

    const choices = diff3.defaultChoices(regions);
    expect(diff3.allDecided(regions, choices)).toBe(true);
    expect(diff3.buildText(regions, choices)).toBe(same);
  });

  it('a deletion against an edit in the same place — an argument', () => {
    const base = lines('a', 'b', 'c');
    const left = lines('a', 'c');
    const right = lines('a', 'B!', 'c');

    const regions = diff3.regions(base, left, right);
    expect(kinds(regions)).toEqual(['same', 'conflict', 'same']);

    const choices = diff3.defaultChoices(regions);
    choices[1] = { left: 'take', right: 'skip' };
    expect(diff3.buildText(regions, choices)).toBe(left);
    choices[1] = { left: 'skip', right: 'take' };
    expect(diff3.buildText(regions, choices)).toBe(right);
  });

  it('changes BUTTED TOGETHER do not split into two hunks', () => {
    const base = lines('a', 'b', 'c', 'd');
    const left = lines('a', 'B', 'c', 'd');
    const right = lines('a', 'b', 'C', 'd');

    const regions = diff3.regions(base, left, right);
    expect(kinds(regions)).toEqual(['same', 'conflict', 'same']);
    expect(regions[1]!.base).toEqual(['b', 'c']);
    expect(regions[1]!.left).toEqual(['B', 'c']);
    expect(regions[1]!.right).toEqual(['b', 'C']);
  });

  it('insertions at one point from both sides — an argument rather than two insertions in a row', () => {
    const base = lines('a', 'b');
    const left = lines('a', 'mine', 'b');
    const right = lines('a', 'theirs', 'b');

    const regions = diff3.regions(base, left, right);
    expect(kinds(regions)).toEqual(['same', 'conflict', 'same']);
    expect(regions[1]!.base).toEqual([]);
  });

  it('there was no ancestor at all — both sides created the file, and the argument is the whole of it', () => {
    const regions = diff3.regions('', lines('mine'), lines('theirs'));
    expect(kinds(regions)).toEqual(['conflict']);
    expect(regions[0]!.base).toEqual([]);
  });

  it('one side did not touch the file — the other gets everything', () => {
    const base = lines('a', 'b');
    const left = lines('a', 'b', 'c');
    const regions = diff3.regions(base, left, base);
    expect(kinds(regions)).toEqual(['same', 'left']);
    expect(diff3.buildText(regions, diff3.defaultChoices(regions))).toBe(left);
  });

  it('green can be unselected — and then the ancestor\'s version remains', () => {
    const base = lines('a', 'b');
    const left = lines('a', 'B');
    const regions = diff3.regions(base, left, base);
    const choices = diff3.defaultChoices(regions);
    choices[1] = { left: 'skip', right: null };
    expect(diff3.buildText(regions, choices)).toBe(base);
  });

  it('taking a side whole is exactly its text', () => {
    const base = lines('a', 'b', 'c', 'd', 'e');
    const left = lines('A', 'b', 'contested on the left', 'd', 'e');
    const right = lines('a', 'b', 'contested on the right', 'd', 'E');

    const regions = diff3.regions(base, left, right);
    expect(kinds(regions)).toContain('conflict');

    expect(diff3.buildText(regions, diff3.takeSide(regions, 'left'))).toBe(left);
    expect(diff3.buildText(regions, diff3.takeSide(regions, 'right'))).toBe(right);
    expect(diff3.allDecided(regions, diff3.takeSide(regions, 'left'))).toBe(true);
  });

  it('an empty result is an empty file rather than a file holding one newline', () => {
    const base = lines('a');
    const regions = diff3.regions(base, '', '');
    expect(diff3.buildText(regions, diff3.defaultChoices(regions))).toBe('');
  });

  it('the hunks cover each side whole and exactly once', () => {
    const base = lines('1', '2', '3', '4', '5', '6', '7', '8');
    const left = lines('1', 'two', '3', '4', '5', 'six', '7', '8');
    const right = lines('1', '2', '3', 'FOUR', '5', 'six', '7', '8', '9');

    const regions = diff3.regions(base, left, right);
    expect(regions.flatMap((r) => r.base).join('\n')).toBe(base.trimEnd());
    expect(regions.flatMap((r) => r.left).join('\n')).toBe(left.trimEnd());
    expect(regions.flatMap((r) => r.right).join('\n')).toBe(right.trimEnd());
  });
});
