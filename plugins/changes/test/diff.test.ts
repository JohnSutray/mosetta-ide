import { describe, expect, it } from 'vitest';
import { LineDiff } from '@mosetta/ide-plugin-code';
import { Diff } from '../src/diff.js';

/**
 * A file's diff.
 *
 * The parsing here is REAL — the same `LineDiff` that computes the strips beside the
 * rows and the three-way merge: a fake would be checking our belief in its habits. Only
 * the sources of text are substituted: "how it was" and "how it is now" are the
 * neighbours' work rather than the panel's.
 */

const lineDiff = new LineDiff();

function raise(before: string | null, now: string, options: { fail?: string } = {}) {
  return new Diff(
    async () => ({ text: before }),
    async () => {
      if (options.fail) throw new Error(options.fail);
      return { text: now };
    },
    (a, b) => lineDiff.steps(a, b),
    (text) => lineDiff.split(text),
  );
}

/** The rows in one batch, as they are seen on the screen. */
function shown(diff: Diff): string[] {
  return diff.blocks().flatMap((block) =>
    block.kind === 'fold' ? [`…${block.lines}`] : block.rows.map((row) => `${sign(row.kind)}${row.text}`),
  );
}

function sign(kind: 'same' | 'del' | 'ins'): string {
  return kind === 'ins' ? '+' : kind === 'del' ? '-' : ' ';
}

describe('a file\'s diff', () => {
  it('an added row names its number on the right only', async () => {
    const diff = raise('a\nb\n', 'a\nnew\nb\n');
    await diff.show('src/a.ts');

    const rows = diff.rows();
    expect(rows.map((row) => `${sign(row.kind)}${row.text}`)).toEqual([' a', '+new', ' b']);
    expect(rows[1]).toMatchObject({ old: null, now: 2 });
    expect(diff.count()).toEqual({ added: 1, removed: 0 });
  });

  it('a new file is the whole text added rather than an edit to an empty line', async () => {
    const diff = raise(null, 'one\ntwo\n');
    await diff.show('src/new.ts');
    expect(shown(diff)).toEqual(['+one', '+two']);
  });

  it('a deleted file does not ask the memory: emptiness there is an answer rather than a refusal', async () => {
    const diff = raise('gone\n', '', { fail: 'the document is not open' });
    await diff.show('src/gone.ts', 'deleted');
    expect(diff.error.value, 'there must be no error: the file really is gone').toBe('');
    expect(shown(diff)).toEqual(['-gone']);
  });

  it('a file not in memory is an error out loud rather than an empty diff', async () => {
    const diff = raise('was\n', '', { fail: 'the document is not open: src/big.bin' });
    await diff.show('src/big.bin');
    expect(diff.error.value).toContain('src/big.bin');
  });

  it('an unchanged middle folds and NAMES how much it has hidden', async () => {
    const before = ['head', ...filler(20), 'tail'].join('\n');
    const after = ['HEAD', ...filler(20), 'TAIL'].join('\n');
    const diff = raise(before, after);
    await diff.show('src/long.ts');

    expect(shown(diff)).toEqual([
      '-head',
      '+HEAD',
      ' l1',
      ' l2',
      ' l3',
      '…14',
      ' l18',
      ' l19',
      ' l20',
      '-tail',
      '+TAIL',
    ]);
  });

  it('a fold opens on a click and folds back again', async () => {
    const diff = raise(['head', ...filler(20)].join('\n'), ['HEAD', ...filler(20)].join('\n'));
    await diff.show('src/long.ts');
    expect(shown(diff)).toContain('…17');

    diff.toggleFold(0);
    expect(shown(diff)).not.toContain('…17');
    expect(shown(diff)).toContain(' l20');

    diff.toggleFold(0);
    expect(shown(diff)).toContain('…17');
  });

  it('a late answer does not rearrange what is on show', async () => {
    let answer = (_text: string) => {};
    const diff = new Diff(
      async () => ({ text: 'was\n' }),
      (path) =>
        new Promise((resolve) => {
          if (path === 'src/slow.ts') answer = (text) => resolve({ text });
          else resolve({ text: 'fast\n' });
        }),
      (a, b) => lineDiff.steps(a, b),
      (text) => lineDiff.split(text),
    );

    const slow = diff.show('src/slow.ts');
    await diff.show('src/fast.ts');
    answer('slow\n');
    await slow;

    expect(diff.path.value).toBe('src/fast.ts');
    expect(diff.after.value, 'an answer about another file has no right to be added').toBe('fast\n');
  });

  it('in two columns an edit stands as a pair: what was on the left, what became on the right', async () => {
    const diff = raise('one\ntwo\nthree\n', 'one\nTWO\nthree\n');
    await diff.show('src/a.ts');

    const pairs = diff.sides().flatMap((block) => (block.kind === 'fold' ? [] : block.pairs));
    expect(pairs.map((pair) => [pair.left?.text ?? null, pair.right?.text ?? null])).toEqual([
      ['one', 'one'],
      ['two', 'TWO'],
      ['three', 'three'],
    ]);
  });

  it('sides of different lengths: the shorter one is left with empty space rather than a shift', async () => {
    const diff = raise('gone\n', 'a\nb\nc\n');
    await diff.show('src/a.ts');

    const pairs = diff.sides().flatMap((block) => (block.kind === 'fold' ? [] : block.pairs));
    expect(pairs.map((pair) => [pair.left?.text ?? null, pair.right?.text ?? null])).toEqual([
      ['gone', 'a'],
      [null, 'b'],
      [null, 'c'],
    ]);
  });

  it('the folds of the two columns are the same: the view does not change what is hidden', async () => {
    const diff = raise(['head', ...filler(20), 'tail'].join('\n'), ['HEAD', ...filler(20), 'TAIL'].join('\n'));
    await diff.show('src/long.ts');

    const folds = (blocks: Array<{ kind: string; lines?: number }>) =>
      blocks.filter((block) => block.kind === 'fold').map((block) => block.lines);
    expect(folds(diff.sides())).toEqual(folds(diff.blocks()));
  });

  it('a closed diff forgets the file: the next opening is no continuation of the last', async () => {
    const diff = raise('a\n', 'b\n');
    await diff.show('src/a.ts');
    diff.close();
    expect(diff.open.value).toBe(false);
    expect(diff.path.value).toBe(null);
  });
});

describe('the view follows the snapshot', () => {
  const diff = new Diff(
    async () => ({ text: '' }),
    async () => ({ text: '' }),
    () => [],
    (text) => (text === '' ? [] : text.split('\n')),
  );
  const key = (state: string, path: string) => `${state}\u0000${path}`;

  it('the file has been reverted — there is nothing to show, the overlay closes', () => {
    expect(diff.decide(key('modified', 'a.ts'), key('clean', 'a.ts'))).toEqual({ do: 'close' });
  });

  it('the file has changed differently — we re-read the sides', () => {
    expect(diff.decide(key('modified', 'a.ts'), key('conflict', 'a.ts'))).toEqual({
      do: 'show',
      path: 'a.ts',
      state: 'other',
    });
    expect(diff.decide(key('modified', 'a.ts'), key('deleted', 'a.ts'))).toMatchObject({ state: 'deleted' });
  });

  it('a click on the next row is a view in itself: we do not set up a second reading', () => {
    expect(diff.decide(key('modified', 'a.ts'), key('modified', 'b.ts'))).toEqual({ do: 'skip' });
  });

  it('opening and closing are not a change of state', () => {
    expect(diff.decide('', key('modified', 'a.ts'))).toEqual({ do: 'skip' });
    expect(diff.decide(key('modified', 'a.ts'), '')).toEqual({ do: 'skip' });
  });

  it('the snapshot has been re-read and the file is the same — we do nothing', () => {
    expect(diff.decide(key('modified', 'a.ts'), key('modified', 'a.ts'))).toEqual({ do: 'skip' });
  });
});

/** N identical rows: the middle the diff is obliged to fold. */
function filler(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `l${i + 1}`);
}

describe('reverting one hunk', () => {
  it('it brings back the hunk\'s rows as in the commit and leaves the rest alone', async () => {
    const diff = raise('one\ntwo\nthree\nfour\n', 'one\nTWO\nthree\nFOUR\n');
    await diff.show('a.ts');
    expect(diff.revertedText(0)).toBe('one\ntwo\nthree\nFOUR\n');
    expect(diff.revertedText(1)).toBe('one\nTWO\nthree\nfour\n');
  });

  it('added rows disappear, removed ones come back', async () => {
    const added = raise('one\ntwo\n', 'one\nfresh\ntwo\n');
    await added.show('a.ts');
    expect(added.revertedText(0)).toBe('one\ntwo\n');

    const removed = raise('one\ntwo\nthree\n', 'one\nthree\n');
    await removed.show('a.ts');
    expect(removed.revertedText(0)).toBe('one\ntwo\nthree\n');
  });

  it('the trailing line break stays where it is', async () => {
    const diff = raise('one\ntwo\n', 'one\nTWO\n');
    await diff.show('a.ts');
    expect(diff.revertedText(0)).toBe('one\ntwo\n');
  });

  it('there is no hunk with that number — we do not invent the text', async () => {
    const diff = raise('one\n', 'one\n');
    await diff.show('a.ts');
    expect(diff.revertedText(0)).toBe(null);
  });
});
