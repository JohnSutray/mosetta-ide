import { describe, expect, it } from 'vitest';
import { HitLine } from '../src/hit-line.js';
import type { FileHit } from '../src/grep.js';

/**
 * A hit row is code, and it is painted as code. The painting arrives as an argument, so
 * what is checked here is exactly the slicing: the display window, the match as its own
 * piece, and the colours not slipping.
 */
const hit = (text: string, from: number, to: number): FileHit => ({ path: 'a.ts', line: 4, from, to, text });
/** A fake highlighting: every word its own colour, spaces without one. */
const byWord = (text: string) =>
  text.split(/(\s+)/).filter((part) => part !== '').map((part) => ({ text: part, color: /\s/.test(part) ? null : '#c' }));

describe('a hit row', () => {
  it('the match is a piece of its own, the rest around it', () => {
    const line = new HitLine(byWord);
    const { pieces, cut } = line.of(hit('const followEditor = true;', 6, 18));
    expect(cut).toBe(false);
    expect(pieces.map((one) => one.text).join('')).toBe('const followEditor = true;');
    expect(pieces.filter((one) => one.match).map((one) => one.text)).toEqual(['followEditor']);
  });

  it('a match inside a word cuts the piece in two, and both halves keep the colour', () => {
    const line = new HitLine(byWord);
    const { pieces } = line.of(hit('alpha beta', 0, 2));
    expect(pieces.slice(0, 2).map((one) => [one.text, one.match, one.color])).toEqual([
      ['al', true, '#c'],
      ['pha', false, '#c'],
    ]);
  });

  it('a long start is cut off, and that is said', () => {
    const line = new HitLine(byWord);
    const text = `${'x'.repeat(200)} needle`;
    const { pieces, cut } = line.of(hit(text, 201, 207));
    expect(cut).toBe(true);
    expect(pieces.map((one) => one.text).join('').length).toBeLessThan(60);
    expect(pieces.filter((one) => one.match).map((one) => one.text)).toEqual(['needle']);
  });

  it('the painting drifted from the text — we show the row in one colour', () => {
    const line = new HitLine(() => [{ text: 'a lie', color: '#f' }]);
    const { pieces } = line.of(hit('const a = 1;', 6, 7));
    expect(pieces.map((one) => one.text).join('')).toBe('const a = 1;');
    expect(pieces.every((one) => one.color === null)).toBe(true);
    expect(pieces.filter((one) => one.match).map((one) => one.text)).toEqual(['a']);
  });

  it('a very long line is parsed only by the display window', () => {
    const seen: string[] = [];
    const line = new HitLine((text) => {
      seen.push(text);
      return [{ text, color: null }];
    });
    const text = `${'y'.repeat(5000)}needle`;
    const { pieces } = line.of(hit(text, 5000, 5006));
    expect(seen[0]?.length ?? 0).toBeLessThan(200);
    expect(pieces.filter((one) => one.match).map((one) => one.text)).toEqual(['needle']);
  });
});
