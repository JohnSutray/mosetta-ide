import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FACTORY_KEYMAP } from '../../plugins/keymap/src/keymap.js';
import type { KeyScope } from '../../plugins/keymap/src/types.js';
import { Chord, Rows } from '../src/chord.js';
import { Stand } from '../src/stand.js';

/**
 * The layout whole, as a table, with real presses.
 *
 * Until this, not one of the two-hundred-odd rows of the layout was ever checked by a
 * press: the browser's own tooling sends `event.code` empty, and the layout stands on
 * it. Here the keys go through CDP with real `code`/`key`, and the question "does a new
 * layout row get through" answers itself, for every row — the test grows along with the
 * shipment.
 *
 * How the answer is read: the keys window (Cmd+9) CATCHES presses — it shows the echo
 * but does not run the command. That is exactly what a table needs: everything can be
 * pressed in turn with nothing saved, nothing reloaded and nothing opened. The echo is
 * read from the `data-echo-*` attributes in the window.
 */

const chrome = await Stand.chromeHere();
if (!chrome) console.warn('e2e: no Chrome found on this machine — the layout was NOT checked by pressing');

const os = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
const scopes: KeyScope[] = ['browser', `browser:${os}`];

interface Echo {
  key: string;
  command: string;
  seq: number;
}

describe.skipIf(!chrome)('the layout as a table, with a real Chrome', () => {
  let stand: Stand;
  const chord = new Chord();

  const echo = async (): Promise<Echo | null> =>
    stand.page.evaluate(() => {
      const box = document.querySelector<HTMLElement>('.keys-echo');
      if (!box || !box.dataset['echoSeq']) return null;
      return {
        key: box.dataset['echoKey'] ?? '',
        command: box.dataset['echoCommand'] ?? '',
        seq: Number(box.dataset['echoSeq']),
      };
    });

  const press = async (key: string): Promise<void> => {
    const { key: name, times } = chord.presses(key);
    for (let i = 0; i < times; i += 1) await stand.page.keyboard.press(name);
  };

  beforeAll(async () => {
    stand = await Stand.up();
    const show = FACTORY_KEYMAP.bindings.find(
      (binding) => binding.command === 'keys.show' && binding.where?.some((scope) => scopes.includes(scope)),
    );
    if (!show) throw new Error(`there is no keys.show in the layout for ${scopes.join(', ')}`);
    await press(show.key);
    await stand.page.waitForSelector('.keys-echo', { timeout: 20_000 });
  });

  afterAll(async () => {
    await stand?.down();
  });

  it('every global row of this environment reaches its own command', async () => {
    const rows = new Rows(scopes);
    const table = rows.global(FACTORY_KEYMAP.bindings).filter((binding) => binding.command !== 'keys.show');
    const misses: string[] = [];
    let last = (await echo())?.seq ?? 0;
    for (const binding of table) {
      await press(binding.key);
      const heard = await echo();
      if (!heard || heard.seq === last) {
        misses.push(`${binding.key} → the press did not reach the layout at all (expected ${binding.command})`);
        continue;
      }
      last = heard.seq;
      if (heard.key !== binding.key || heard.command !== binding.command) {
        misses.push(`${binding.key} → heard «${heard.key}» = ${heard.command || 'nothing'} (expected ${binding.command})`);
      }
    }
    console.info(
      `e2e layout: ${table.length} global rows for ${scopes.join('/')} pressed; ` +
        `${rows.contextual(FACTORY_KEYMAP.bindings)} rows with a surface are waiting for a scenario of their own`,
    );
    expect(misses, misses.join('\n')).toEqual([]);
  });

  it('calibration: the keys Chrome keeps for itself DO reach the page through CDP', async () => {
    const before = (await echo())?.seq ?? 0;
    await stand.page.keyboard.press('Meta+KeyT');
    const after = (await echo())?.seq ?? 0;
    expect(after, 'Cmd+T reached the page: the browser\'s layer has been bypassed').toBeGreaterThan(before);
  });

  it('the key that opened the keys window closes it too — from inside', async () => {
    const show = FACTORY_KEYMAP.bindings.find(
      (binding) => binding.command === 'keys.show' && binding.where?.some((scope) => scopes.includes(scope)),
    )!;
    await press(show.key);
    await stand.page.waitForSelector('.keys-echo', { state: 'detached', timeout: 10_000 });
  });
});
