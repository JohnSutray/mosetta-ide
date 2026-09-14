import { describe, expect, it } from 'vitest';
import { ProcessMemory, type ProcessRow } from '../src/env/memory.js';

const memory = new ProcessMemory();

const LANGUAGE_SERVER: ProcessRow[] = [
  { pid: 1, ppid: 0, kb: 1000 },
  { pid: 100, ppid: 1, kb: 62_000 },
  { pid: 101, ppid: 100, kb: 74_000 },
  { pid: 102, ppid: 100, kb: 1_050_000 },
  { pid: 200, ppid: 1, kb: 500_000 },
];

describe('память дерева процессов', () => {
  it('складывает потомков, а не только запущенного', () => {
    expect(memory.subtreeKb(LANGUAGE_SERVER, 100)).toBe(62_000 + 74_000 + 1_050_000);
  });

  it('чужие ветки не считает', () => {
    expect(memory.subtreeKb(LANGUAGE_SERVER, 102)).toBe(1_050_000);
  });

  it('считает внуков, а не только детей', () => {
    const deep: ProcessRow[] = [
      { pid: 10, ppid: 1, kb: 10 },
      { pid: 11, ppid: 10, kb: 100 },
      { pid: 12, ppid: 11, kb: 1000 },
    ];
    expect(memory.subtreeKb(deep, 10)).toBe(1110);
  });

  it('круг в таблице не вешает обход', () => {
    const loop: ProcessRow[] = [
      { pid: 10, ppid: 11, kb: 10 },
      { pid: 11, ppid: 10, kb: 100 },
    ];
    expect(memory.subtreeKb(loop, 10)).toBe(110);
  });

  it('незнакомый корень — ноль, а не выдумка', () => {
    expect(memory.subtreeKb(LANGUAGE_SERVER, 999)).toBe(0);
  });

  it('без pid мерить нечего', async () => {
    expect(await memory.treeMb(undefined)).toBeNull();
  });
});
