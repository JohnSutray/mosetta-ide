import { describe, expect, it } from 'vitest';
import { HitLine } from '../src/hit-line.js';
import type { FileHit } from '../src/grep.js';

const hit = (text: string, from: number, to: number): FileHit => ({ path: 'a.ts', line: 4, from, to, text });
const byWord = (text: string) =>
  text.split(/(\s+)/).filter((part) => part !== '').map((part) => ({ text: part, color: /\s/.test(part) ? null : '#c' }));

describe('строка находки', () => {
  it('совпадение — отдельный кусок, остальное вокруг него', () => {
    const line = new HitLine(byWord);
    const { pieces, cut } = line.of(hit('const followEditor = true;', 6, 18));
    expect(cut).toBe(false);
    expect(pieces.map((one) => one.text).join('')).toBe('const followEditor = true;');
    expect(pieces.filter((one) => one.match).map((one) => one.text)).toEqual(['followEditor']);
  });

  it('совпадение внутри слова режет кусок надвое, цвет у обеих половин', () => {
    const line = new HitLine(byWord);
    const { pieces } = line.of(hit('alpha beta', 0, 2));
    expect(pieces.slice(0, 2).map((one) => [one.text, one.match, one.color])).toEqual([
      ['al', true, '#c'],
      ['pha', false, '#c'],
    ]);
  });

  it('длинное начало отрезано, и об этом сказано', () => {
    const line = new HitLine(byWord);
    const text = `${'x'.repeat(200)} needle`;
    const { pieces, cut } = line.of(hit(text, 201, 207));
    expect(cut).toBe(true);
    expect(pieces.map((one) => one.text).join('').length).toBeLessThan(60);
    expect(pieces.filter((one) => one.match).map((one) => one.text)).toEqual(['needle']);
  });

  it('раскраска разошлась с текстом — показываем строку одним цветом', () => {
    const line = new HitLine(() => [{ text: 'враньё', color: '#f' }]);
    const { pieces } = line.of(hit('const a = 1;', 6, 7));
    expect(pieces.map((one) => one.text).join('')).toBe('const a = 1;');
    expect(pieces.every((one) => one.color === null)).toBe(true);
    expect(pieces.filter((one) => one.match).map((one) => one.text)).toEqual(['a']);
  });

  it('очень длинная строка разбирается только окном показа', () => {
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
