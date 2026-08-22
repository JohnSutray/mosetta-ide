import { describe, expect, it } from 'vitest';
import { diffLines } from '../src/editor/line-diff.js';

const text = (...lines: string[]) => `${lines.join('\n')}\n`;

describe('построчный диф', () => {
  it('одинаковые тексты не дают ни одной метки', () => {
    expect(diffLines(text('a', 'b'), text('a', 'b'))).toEqual([]);
  });

  it('дописанные строки — зелёные, на своих номерах', () => {
    const hunks = diffLines(text('a', 'b'), text('a', 'x', 'y', 'b'));
    expect(hunks).toEqual([{ kind: 'added', from: 2, to: 3, before: [] }]);
  });

  it('правка строки — это замена, а не удаление плюс вставка', () => {
    const hunks = diffLines(text('a', 'b', 'c'), text('a', 'B', 'c'));
    expect(hunks).toEqual([{ kind: 'modified', from: 2, to: 2, before: ['b'] }]);
  });

  it('удалённые строки помнят себя и садятся на строку ниже дыры', () => {
    const hunks = diffLines(text('a', 'b', 'c'), text('a', 'c'));
    expect(hunks).toEqual([{ kind: 'removed', from: 2, to: 2, before: ['b'] }]);
  });

  it('удаление в конце садится на последнюю строку', () => {
    const hunks = diffLines(text('a', 'b'), text('a'));
    expect(hunks[0]!.kind).toBe('removed');
    expect(hunks[0]!.before).toEqual(['b']);
  });

  it('новый файл целиком зелёный', () => {
    expect(diffLines('', text('a', 'b'))).toEqual([
      { kind: 'added', from: 1, to: 2, before: [] },
    ]);
  });

  it('хвостовой перевод строки не считается строкой', () => {
    expect(diffLines('a\n', 'a')).toEqual([]);
    expect(diffLines('a', 'a\n')).toEqual([]);
  });

  it('несколько правок в разных местах не сливаются', () => {
    const hunks = diffLines(
      text('1', '2', '3', '4', '5', '6'),
      text('1', 'два', '3', '4', '5', '6', '7'),
    );
    expect(hunks).toEqual([
      { kind: 'modified', from: 2, to: 2, before: ['2'] },
      { kind: 'added', from: 7, to: 7, before: [] },
    ]);
  });

  it('большой файл разбирается быстро', () => {
    const many = (n: number, mark: string) =>
      Array.from({ length: n }, (_, i) => `${mark}строка ${i}`).join('\n');
    const before = many(20_000, '');
    const after = `${many(10_000, '')}\nвставка\n${many(10_000, '').slice(0)}`;
    const started = performance.now();
    const hunks = diffLines(before, after);
    expect(performance.now() - started).toBeLessThan(500);
    expect(hunks.length).toBeGreaterThan(0);
  });
});
