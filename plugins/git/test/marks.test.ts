import { describe, expect, it } from 'vitest';
import { GitMarks } from '../src/marks.js';

/**
 * The text from a commit belongs to a file.
 *
 * The bug was visible and had lived a long time: for a fraction of a second on every
 * open, a file was highlighted blue whole — that was the new text being compared with
 * the old answer left over from the previous file. The answer and the path travel
 * together, and somebody else's answer is not taken even if it arrived later than our
 * own request.
 *
 * The server is substituted: the marks receive it through the constructor, and the test
 * decides what it will answer and WHEN.
 */
function remoteAnswering(answers: Record<string, string | null>) {
  return {
    head: async (path: string) => ({ path, text: answers[path] ?? null }),
  };
}

describe('the text from a commit belongs to a file', () => {
  it('the answer is about this file — we take it', async () => {
    const marks = new GitMarks(remoteAnswering({ 'a.ts': 'it was' }), () => ({ openDoc: { value: null }, replaceText: () => undefined }) as never);
    await marks.load('a.ts');
    expect(marks.head.value).toEqual({ path: 'a.ts', text: 'it was' });
  });

  it('the answer is about a neighbouring file — we do not take it', async () => {
    const marks = new GitMarks({ head: async () => ({ path: 'b.ts', text: 'somebody else\'s' }) }, () => ({ openDoc: { value: null }, replaceText: () => undefined }) as never);
    await marks.load('a.ts');
    expect(marks.head.value).toBe(null);
  });

  it('the file was closed — there is no answer and no strips', async () => {
    const marks = new GitMarks(remoteAnswering({ 'a.ts': 'it was' }), () => ({ openDoc: { value: null }, replaceText: () => undefined }) as never);
    await marks.load('a.ts');
    await marks.load(null);
    expect(marks.head.value).toBe(null);
  });

  it('the file was not in the history — that is an answer too, and it is empty', async () => {
    const marks = new GitMarks(remoteAnswering({ 'new.ts': null }), () => ({ openDoc: { value: null }, replaceText: () => undefined }) as never);
    await marks.load('new.ts');
    expect(marks.head.value).toEqual({ path: 'new.ts', text: null });
  });

  it('the server refused — we take it that there is no history', async () => {
    const marks = new GitMarks({
      head: async () => {
        throw new Error('not a repository');
      },
    }, () => ({ openDoc: { value: null }, replaceText: () => undefined }) as never);
    await marks.load('a.ts');
    expect(marks.head.value).toBe(null);
  });
});

describe('reverting a hunk calls the NEIGHBOUR\'S door', () => {
  it('the text leaves through `replaceText` rather than through `editDoc`', () => {
    const asked: string[] = [];
    const docs = () =>
      ({
        openDoc: { value: { path: 'a.ts', text: 'one\ntwo\nthree\n' } },
        replaceText: (text: string) => asked.push(text),
      }) as never;
    const marks = new GitMarks({ head: async (path: string) => ({ path, text: null }) }, docs);

    marks.show({ kind: 'modified', from: 2, to: 2, before: ['TWO'] }, { top: 0, left: 0, bottom: 0 });
    marks.revertOpen();

    expect(asked).toEqual(['one\nTWO\nthree\n']);
  });

  it('a revert does not take the file\'s last newline away', () => {
    const asked: string[] = [];
    const docs = () =>
      ({
        openDoc: { value: { path: 'a.ts', text: 'one\ntwo\n' } },
        replaceText: (text: string) => asked.push(text),
      }) as never;
    const marks = new GitMarks({ head: async (path: string) => ({ path, text: null }) }, docs);

    marks.show({ kind: 'added', from: 2, to: 2, before: [] }, { top: 0, left: 0, bottom: 0 });
    marks.revertOpen();

    expect(asked).toEqual(['one\n']);
  });
});
