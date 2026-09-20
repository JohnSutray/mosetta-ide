import { describe, expect, it } from 'vitest';
import { ProcessMemory, type ProcessRow } from '../src/env/memory.js';

/**
 * Memory is measured BY TREE rather than by process.
 *
 * This is not pedantry: we launch `typescript-language-server`, which holds some fifty
 * megabytes — while the gigabyte sits in the `tsserver.js` it spawned itself. Asking
 * only about the one we launched, the budget would never have triggered, and the
 * setting would have been decoration.
 */

const memory = new ProcessMemory();

/**
 * The very arrangement one sees in `ps` on a live machine: somebody else's root,
 * `typescript-language-server`, its two `tsserver` children — one on
 * `--serverMode partialSemantic`, one doing the semantics — and one foreign process that
 * has nothing to do with us.
 */
const LANGUAGE_SERVER: ProcessRow[] = [
  { pid: 1, ppid: 0, kb: 1000 },
  { pid: 100, ppid: 1, kb: 62_000 },
  { pid: 101, ppid: 100, kb: 74_000 },
  { pid: 102, ppid: 100, kb: 1_050_000 },
  { pid: 200, ppid: 1, kb: 500_000 },
];

describe('a process tree\'s memory', () => {
  it('adds the descendants up rather than only the one we started', () => {
    expect(memory.subtreeKb(LANGUAGE_SERVER, 100)).toBe(62_000 + 74_000 + 1_050_000);
  });

  it('does not count somebody else\'s branches', () => {
    expect(memory.subtreeKb(LANGUAGE_SERVER, 102)).toBe(1_050_000);
  });

  it('counts grandchildren rather than only children', () => {
    const deep: ProcessRow[] = [
      { pid: 10, ppid: 1, kb: 10 },
      { pid: 11, ppid: 10, kb: 100 },
      { pid: 12, ppid: 11, kb: 1000 },
    ];
    expect(memory.subtreeKb(deep, 10)).toBe(1110);
  });

  it('hands over the subtree\'s pids, root first', () => {
    expect(memory.subtree(LANGUAGE_SERVER, 100)).toEqual([100, 101, 102]);
    expect(memory.subtree(LANGUAGE_SERVER, 102)).toEqual([102]);
  });

  it('a cycle in the table does not hang the pid walk either', () => {
    const loop: ProcessRow[] = [
      { pid: 10, ppid: 11, kb: 10 },
      { pid: 11, ppid: 10, kb: 100 },
    ];
    expect(memory.subtree(loop, 10)).toEqual([10, 11]);
  });

  it('a cycle in the table does not hang the walk', () => {
    const loop: ProcessRow[] = [
      { pid: 10, ppid: 11, kb: 10 },
      { pid: 11, ppid: 10, kb: 100 },
    ];
    expect(memory.subtreeKb(loop, 10)).toBe(110);
  });

  it('an unknown root is zero rather than an invention', () => {
    expect(memory.subtreeKb(LANGUAGE_SERVER, 999)).toBe(0);
  });

  it('without a pid there is nothing to measure', async () => {
    expect(await memory.treeMb(undefined)).toBeNull();
  });
});
