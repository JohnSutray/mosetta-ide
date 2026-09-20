import { describe, expect, it } from 'vitest';
import { Anchors } from '../src/anchors.js';

/**
 * A breakpoint remembers a place rather than a number.
 *
 * The whole rule is in the choice of line: which of the identical ones to take, and
 * what to do when none is found. Hence a test rather than a comment.
 */
const anchors = new Anchors();

function finder(lines: string[]) {
  return (line: number) => lines[line - 1] ?? '';
}

describe('a breakpoint\'s anchor', () => {
  it('it remembers the text without the indentation: the formatter shifted it, the place is the same', () => {
    expect(anchors.of('    return value;  ')).toBe('return value;');
  });

  it('in its own place — that is where it stays', () => {
    const lines = ['a', 'return value;', 'c'];
    expect(anchors.find(finder(lines), lines.length, 'return value;', 2)).toBe(2);
  });

  it('the line has moved down — the breakpoint travels after it', () => {
    const lines = ['a', 'b', 'c', 'return value;', 'e'];
    expect(anchors.find(finder(lines), lines.length, 'return value;', 2)).toBe(4);
  });

  it('the line has moved up — it is found too', () => {
    const lines = ['return value;', 'b', 'c', 'd'];
    expect(anchors.find(finder(lines), lines.length, 'return value;', 4)).toBe(1);
  });

  it('there are many identical ones — the NEAREST is taken rather than the first', () => {
    const lines = ['}', 'a', 'b', 'c', '}', 'd'];
    expect(anchors.find(finder(lines), lines.length, '}', 4)).toBe(5);
    expect(anchors.find(finder(lines), lines.length, '}', 2)).toBe(1);
  });

  it('at equal distance the upper one is taken — there is one rule rather than "as luck has it"', () => {
    const lines = ['x', '}', 'near', '}', 'y'];
    expect(anchors.find(finder(lines), lines.length, '}', 3)).toBe(2);
  });

  it('none found — the number stays as it was: a breakpoint must not be thrown away silently', () => {
    const lines = ['a', 'b', 'c'];
    expect(anchors.find(finder(lines), lines.length, 'return value;', 2)).toBe(2);
  });

  it('an empty anchor is not searched for at all: any empty line would match', () => {
    const lines = ['a', '', 'c', ''];
    expect(anchors.find(finder(lines), lines.length, '', 3)).toBe(3);
  });

  it('the file has become shorter — the number is pressed against the last line', () => {
    const lines = ['a', 'b'];
    expect(anchors.find(finder(lines), lines.length, 'return value;', 9)).toBe(2);
  });
});
