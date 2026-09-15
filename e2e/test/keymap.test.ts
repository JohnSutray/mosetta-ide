import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FACTORY_KEYMAP } from '../../plugins/keymap/src/keymap.js';
import type { KeyScope } from '../../plugins/keymap/src/types.js';
import { Chord, Rows } from '../src/chord.js';
import { Stand } from '../src/stand.js';

const chrome = await Stand.chromeHere();
if (!chrome) console.warn('e2e: Chrome на этой машине не найден — раскладка нажатиями НЕ проверена');

const os = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
const scopes: KeyScope[] = ['browser', `browser:${os}`];

interface Echo {
  key: string;
  command: string;
  seq: number;
}

describe.skipIf(!chrome)('раскладка таблицей, настоящим Chrome', () => {
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
    if (!show) throw new Error(`в раскладке нет keys.show для ${scopes.join(', ')}`);
    await press(show.key);
    await stand.page.waitForSelector('.keys-echo', { timeout: 20_000 });
  });

  afterAll(async () => {
    await stand?.down();
  });

  it('каждая глобальная строка этого окружения доезжает до своей команды', async () => {
    const rows = new Rows(scopes);
    const table = rows.global(FACTORY_KEYMAP.bindings).filter((binding) => binding.command !== 'keys.show');
    const misses: string[] = [];
    let last = (await echo())?.seq ?? 0;
    for (const binding of table) {
      await press(binding.key);
      const heard = await echo();
      if (!heard || heard.seq === last) {
        misses.push(`${binding.key} → нажатие не дошло до раскладки вовсе (ждали ${binding.command})`);
        continue;
      }
      last = heard.seq;
      if (heard.key !== binding.key || heard.command !== binding.command) {
        misses.push(`${binding.key} → услышано «${heard.key}» = ${heard.command || 'ничего'} (ждали ${binding.command})`);
      }
    }
    console.info(
      `e2e раскладка: ${table.length} глобальных строк для ${scopes.join('/')} нажаты; ` +
        `${rows.contextual(FACTORY_KEYMAP.bindings)} строк с поверхностью ждут своего сценария`,
    );
    expect(misses, misses.join('\n')).toEqual([]);
  });

  it('калибровка: клавиши, которые Chrome оставляет себе, ДОХОДЯТ до страницы через CDP', async () => {
    const before = (await echo())?.seq ?? 0;
    await stand.page.keyboard.press('Meta+KeyT');
    const after = (await echo())?.seq ?? 0;
    expect(after, 'Cmd+T дошёл до страницы: слой браузера обойдён').toBeGreaterThan(before);
  });

  it('клавиша, открывшая окно клавиш, его же и закрывает — изнутри', async () => {
    const show = FACTORY_KEYMAP.bindings.find(
      (binding) => binding.command === 'keys.show' && binding.where?.some((scope) => scopes.includes(scope)),
    )!;
    await press(show.key);
    await stand.page.waitForSelector('.keys-echo', { state: 'detached', timeout: 10_000 });
  });
});
