import { describe, expect, it } from 'vitest';
import type { Windows } from '@mosetta/ide-plugin-ui';
import { FakeHost, nodes, of } from '@mosetta/ide-api/testing';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import KeysPlugin from '../src/client.js';
import { KeysSheet } from '../src/popup.js';
import UiPlugin from '@mosetta/ide-plugin-ui';
import { settingsKey, USER_LAYER } from '@mosetta/ide-api/client';

/** The keys facade is a field on the keymap instance, taken from the stand. */
let keys: KeymapPlugin['keys'];
/** The stand's windows: its own per boot. */
let windows: Windows;
/** The stand's labels are keys: a core service rather than an import. */
let t: (key: string, params?: Record<string, string | number>) => string;

/**
 * The keys window as a plugin: what it promises.
 *
 * It shows the RESOLVED keymap — only the rows of the environment being looked at — and
 * the echo of the last keystroke, which arrives from the core. The switch shows
 * somebody else's layout without reopening the IDE.
 */
async function raise() {
  const host = new FakeHost();
  host.add(UiPlugin, '@mosetta/ide-plugin-ui');
  keys = host.add(KeymapPlugin, '@mosetta/ide-plugin-keymap').keys;
  const plugin = host.add(KeysPlugin, '@mosetta/ide-plugin-keys');
  t = host.surface.t;
  windows = host.plugin(UiPlugin).windows;
  await host.start();
  const mine = `${keys.host}:${keys.os}` as const;
  const alien = keys.os === 'win' ? 'browser:mac' : 'browser:win';
  host.registry.add(settingsKey('keymap'), {
    version: 1,
    bindings: [
      { command: 'file.save', key: 'meta+s', where: [mine] },
      { command: 'file.save', key: 'control+s', where: [alien] },
      { command: 'tree.next', key: 'arrowdown', when: 'tree' },
    ],
  }, USER_LAYER);
  return { host, plugin };
}

/**
 * We call the markup ourselves: the harness hands over nodes rather than rendering
 * them.
 */
function rendered(plugin: KeysPlugin) {
  return nodes(KeysSheet({ keys, windows, window: plugin.window, t }));
}

/** Every row the window shows, in reading order. */
function texts(plugin: KeysPlugin): string[] {
  return rendered(plugin)
    .flatMap((node) => {
      const kids = (node.props as { children?: unknown }).children;
      return Array.isArray(kids) ? kids : [kids];
    })
    .filter((one): one is string => typeof one === 'string');
}

describe('the keys window', () => {
  it('closed by default, and the key opens and closes it', async () => {
    const { host, plugin } = await raise();
    expect(plugin.window.open.value).toBe(false);
    host.run('keys.show');
    expect(plugin.window.open.value).toBe(true);
    host.run('keys.show');
    expect(plugin.window.open.value).toBe(false);
  });

  it('shows only the rows of ITS OWN environment', async () => {
    const { host, plugin } = await raise();
    host.run('keys.show');
    const kbds = of(rendered(plugin), 'kbd').map((one) => String(one.props.children));
    expect(kbds).toContain(keys.humanize('meta+s'));
    expect(kbds).not.toContain(keys.humanize('control+s'));
    expect(kbds).toContain(keys.humanize('arrowdown'));
  });

  it('the switch shows somebody else\'s layout and says so', async () => {
    const { host, plugin } = await raise();
    host.run('keys.show');
    plugin.window.viewHost.value = 'electron';
    expect(texts(plugin)).toContain('keys.elsewhere');
  });

  it('the keystroke echo arrives from the core and is visible at once', async () => {
    const { host, plugin } = await raise();
    host.run('keys.show');
    host.plugin(KeymapPlugin).echo.lastKey.value = { key: 'meta+k', context: 'global', command: null, seq: 1 };
    const kbds = of(rendered(plugin), 'kbd').map((one) => String(one.props.children));
    expect(kbds[0]).toBe(keys.humanize('meta+k'));
  });
});
