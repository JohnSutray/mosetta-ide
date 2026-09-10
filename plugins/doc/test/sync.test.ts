import { describe, expect, it } from 'vitest';
import { DocSync } from '../src/sync.js';

describe('отправка правок', () => {
  it('flush во время летящей правки дожидается её и досылает накопленное', async () => {
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
