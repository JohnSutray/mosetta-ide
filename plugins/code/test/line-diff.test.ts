import { describe, expect, it } from 'vitest';
import { LineDiff } from '../src/line-diff.js';

const lineDiff = new LineDiff();

/**
 * A row-by-row diff for the strips at the side. We check the PROMISES a human sees
 * rather than the algorithm: where the mark will stand, what kind it is, and what it
 * will show for "how it was".
 */
const text = (...lines: string[]) => `${lines.join('\n')}\n`;

describe('the line-by-line diff', () => {
  it('identical texts yield not one mark', () => {
    expect(lineDiff.hunks(text('a', 'b'), text('a', 'b'))).toEqual([]);
  });

  it('appended lines are green, on their own numbers', () => {
    const hunks = lineDiff.hunks(text('a', 'b'), text('a', 'x', 'y', 'b'));
    expect(hunks).toEqual([{ kind: 'added', from: 2, to: 3, before: [] }]);
  });

  it('editing a line is a replacement rather than a deletion plus an insertion', () => {
    const hunks = lineDiff.hunks(text('a', 'b', 'c'), text('a', 'B', 'c'));
    expect(hunks).toEqual([{ kind: 'modified', from: 2, to: 2, before: ['b'] }]);
  });

  it('deleted lines remember themselves and sit on the line below the hole', () => {
    const hunks = lineDiff.hunks(text('a', 'b', 'c'), text('a', 'c'));
    expect(hunks).toEqual([{ kind: 'removed', from: 2, to: 2, before: ['b'] }]);
  });

  it('a deletion at the end sits on the last line', () => {
    const hunks = lineDiff.hunks(text('a', 'b'), text('a'));
    expect(hunks[0]!.kind).toBe('removed');
    expect(hunks[0]!.before).toEqual(['b']);
  });

  it('a new file is green whole', () => {
    expect(lineDiff.hunks('', text('a', 'b'))).toEqual([
      { kind: 'added', from: 1, to: 2, before: [] },
    ]);
  });

  it('a trailing newline does not count as a line', () => {
    expect(lineDiff.hunks('a\n', 'a')).toEqual([]);
    expect(lineDiff.hunks('a', 'a\n')).toEqual([]);
  });

  it('several edits in different places do not merge', () => {
    const hunks = lineDiff.hunks(
      text('1', '2', '3', '4', '5', '6'),
      text('1', 'two', '3', '4', '5', '6', '7'),
    );
    expect(hunks).toEqual([
      { kind: 'modified', from: 2, to: 2, before: ['2'] },
      { kind: 'added', from: 7, to: 7, before: [] },
    ]);
  });

  it('a large file is parsed quickly', () => {
    const many = (n: number, mark: string) =>
      Array.from({ length: n }, (_, i) => `${mark}line ${i}`).join('\n');
    const before = many(20_000, '');
    const after = `${many(10_000, '')}\ninserted\n${many(10_000, '').slice(0)}`;
    const started = performance.now();
    const hunks = lineDiff.hunks(before, after);
    expect(performance.now() - started).toBeLessThan(500);
    expect(hunks.length).toBeGreaterThan(0);
  });
});
