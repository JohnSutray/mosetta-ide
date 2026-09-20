import { describe, expect, it } from 'vitest';
import { DocSync } from '../src/sync.js';

/**
 * Sending edits. `flush` promises "everything typed is already on the server" — the
 * question to the language server about completion rests on that: ask it before the
 * text and tsserver receives a line it does not have.
 */
describe('sending edits', () => {
  it('a flush during an edit in flight waits for it and sends what accumulated', async () => {
    const sent: string[] = [];
    const answers: Array<() => void> = [];
    const sync = new DocSync(
      {
        edit: (_path: string, text: string, base: number) => {
          sent.push(text);
          return new Promise((resolve) => answers.push(() => resolve({ version: base + 1 })));
        },
      } as never,
      () => undefined,
    );
    sync.attach({ path: 'a.ts', version: 1 } as never);

    sync.edit('one');
    const first = sync.flush();
    sync.edit('two');
    let done = false;
    const second = sync.flush().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(sent).toEqual(['one']);
    expect(done).toBe(false);

    answers.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toEqual(['one', 'two']);
    expect(done).toBe(false);

    answers.shift()!();
    await Promise.all([first, second]);
    expect(done).toBe(true);
    expect(sync.version).toBe(3);
  });
});
