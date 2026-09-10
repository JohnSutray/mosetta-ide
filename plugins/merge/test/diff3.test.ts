import { LineDiff } from '@ide/plugin-code';
import { Diff3, type Region } from '../src/diff3.js';

const diff3 = new Diff3(() => new LineDiff());
import { describe, expect, it } from 'vitest';

const lines = (...items: string[]) => `${items.join('\n')}\n`;
const kinds = (regions: Region[]) => regions.map((region) => region.kind);

describe('diff3', () => {
  it('никто не трогал — один участок и ни одного решения', () => {
    const base = lines('a', 'b', 'c');
    const regions = diff3.regions(base, base, base);
    expect(kinds(regions)).toEqual(['same']);
    expect(diff3.allDecided(regions, diff3.defaultChoices(regions))).toBe(true);
    expect(diff3.buildText(regions, diff3.defaultChoices(regions))).toBe(base);
  });

  it('стороны тронули РАЗНЫЕ места — оба изменения вливаются сами', () => {
    const base = lines('a', 'b', 'c', 'd', 'e');
    const left = lines('A', 'b', 'c', 'd', 'e');
    const right = lines('a', 'b', 'c', 'd', 'E');

    const regions = diff3.regions(base, left, right);
    expect(kinds(regions)).toEqual(['left', 'same', 'right']);

    const choices = diff3.defaultChoices(regions);
    expect(diff3.allDecided(regions, choices)).toBe(true);
    expect(diff3.buildText(regions, choices)).toBe(lines('A', 'b', 'c', 'd', 'E'));
  });

  it('стороны тронули ОДНО место по-разному — это спор', () => {
    const base = lines('a', 'b', 'c');
    const left = lines('a', 'ЛЕВОЕ', 'c');
    const right = lines('a', 'ПРАВОЕ', 'c');

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
    expect(diff3.buildText(regions, choices)).toBe(lines('a', 'ЛЕВОЕ', 'ПРАВОЕ', 'c'));

    choices[1] = { left: 'skip', right: null };
    expect(diff3.allDecided(regions, choices)).toBe(false);
    choices[1] = { left: 'skip', right: 'skip' };
    expect(diff3.allDecided(regions, choices)).toBe(true);
    expect(diff3.buildText(regions, choices)).toBe(lines('a', 'c'));
  });

  it('ОДИНАКОВАЯ правка с двух сторон — согласие, а не спор', () => {
    const base = lines('a', 'b', 'c');
    const same = lines('a', 'ОБА', 'c');

    const regions = diff3.regions(base, same, same);
    expect(kinds(regions)).toEqual(['same', 'both', 'same']);

    const choices = diff3.defaultChoices(regions);
    expect(diff3.allDecided(regions, choices)).toBe(true);
    expect(diff3.buildText(regions, choices)).toBe(same);
  });

  it('удаление против правки в том же месте — спор', () => {
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

  it('изменения ВСТЫК не разъезжаются на два участка', () => {
    const base = lines('a', 'b', 'c', 'd');
    const left = lines('a', 'B', 'c', 'd');
    const right = lines('a', 'b', 'C', 'd');

    const regions = diff3.regions(base, left, right);
    expect(kinds(regions)).toEqual(['same', 'conflict', 'same']);
    expect(regions[1]!.base).toEqual(['b', 'c']);
    expect(regions[1]!.left).toEqual(['B', 'c']);
    expect(regions[1]!.right).toEqual(['b', 'C']);
  });

  it('вставки в одну точку с двух сторон — спор, а не две вставки подряд', () => {
    const base = lines('a', 'b');
    const left = lines('a', 'моё', 'b');
    const right = lines('a', 'чужое', 'b');

    const regions = diff3.regions(base, left, right);
    expect(kinds(regions)).toEqual(['same', 'conflict', 'same']);
    expect(regions[1]!.base).toEqual([]);
  });

  it('предка не было вовсе — обе стороны создали файл, спор целиком', () => {
    const regions = diff3.regions('', lines('моё'), lines('чужое'));
    expect(kinds(regions)).toEqual(['conflict']);
    expect(regions[0]!.base).toEqual([]);
  });

  it('одна сторона не тронула файл — второй достаётся всё', () => {
    const base = lines('a', 'b');
    const left = lines('a', 'b', 'c');
    const regions = diff3.regions(base, left, base);
    expect(kinds(regions)).toEqual(['same', 'left']);
    expect(diff3.buildText(regions, diff3.defaultChoices(regions))).toBe(left);
  });

  it('снять зелёное можно — и тогда остаётся версия предка', () => {
    const base = lines('a', 'b');
    const left = lines('a', 'B');
    const regions = diff3.regions(base, left, base);
    const choices = diff3.defaultChoices(regions);
    choices[1] = { left: 'skip', right: null };
    expect(diff3.buildText(regions, choices)).toBe(base);
  });

  it('взять сторону целиком — это ровно её текст', () => {
    const base = lines('a', 'b', 'c', 'd', 'e');
    const left = lines('A', 'b', 'спорное слева', 'd', 'e');
    const right = lines('a', 'b', 'спорное справа', 'd', 'E');

    const regions = diff3.regions(base, left, right);
    expect(kinds(regions)).toContain('conflict');

    expect(diff3.buildText(regions, diff3.takeSide(regions, 'left'))).toBe(left);
    expect(diff3.buildText(regions, diff3.takeSide(regions, 'right'))).toBe(right);
    expect(diff3.allDecided(regions, diff3.takeSide(regions, 'left'))).toBe(true);
  });

  it('пустой результат — это пустой файл, а не файл из одного перевода строки', () => {
    const base = lines('a');
    const regions = diff3.regions(base, '', '');
    expect(diff3.buildText(regions, diff3.defaultChoices(regions))).toBe('');
  });

  it('участки покрывают каждую сторону целиком и ровно один раз', () => {
    const base = lines('1', '2', '3', '4', '5', '6', '7', '8');
    const left = lines('1', 'два', '3', '4', '5', 'шесть', '7', '8');
    const right = lines('1', '2', '3', 'ЧЕТЫРЕ', '5', 'шесть', '7', '8', '9');

    const regions = diff3.regions(base, left, right);
    expect(regions.flatMap((r) => r.base).join('\n')).toBe(base.trimEnd());
    expect(regions.flatMap((r) => r.left).join('\n')).toBe(left.trimEnd());
    expect(regions.flatMap((r) => r.right).join('\n')).toBe(right.trimEnd());
  });
});
