import { describe, expect, it } from 'vitest';
import type { Windows } from '@mosetta/ide-plugin-ui';
import { FakeHost, nodes, of } from '@mosetta/ide-api/testing';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import KeysPlugin from '../src/client.js';
import { KeysSheet } from '../src/popup.js';
import UiPlugin from '@mosetta/ide-plugin-ui';
import { settingsKey, USER_LAYER } from '@mosetta/ide-api/client';

let keys: KeymapPlugin['keys'];
let windows: Windows;
let t: (key: string, params?: Record<string, string | number>) => string;

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

function rendered(plugin: KeysPlugin) {
  return nodes(KeysSheet({ keys, windows, window: plugin.window, t }));
}

function texts(plugin: KeysPlugin): string[] {
  return rendered(plugin)
    .flatMap((node) => {
      const kids = (node.props as { children?: unknown }).children;
      return Array.isArray(kids) ? kids : [kids];
    })
    .filter((one): one is string => typeof one === 'string');
}

describe('окно клавиш', () => {
  it('закрыто по умолчанию, клавиша открывает и закрывает', async () => {
    const { host, plugin } = await raise();
    expect(plugin.window.open.value).toBe(false);
    host.run('keys.show');
    expect(plugin.window.open.value).toBe(true);
    host.run('keys.show');
    expect(plugin.window.open.value).toBe(false);
  });

  it('показывает только строки СВОЕГО окружения', async () => {
    const { host, plugin } = await raise();
    host.run('keys.show');
    const kbds = of(rendered(plugin), 'kbd').map((one) => String(one.props.children));
    expect(kbds).toContain(keys.humanize('meta+s'));
    expect(kbds).not.toContain(keys.humanize('control+s'));
    expect(kbds).toContain(keys.humanize('arrowdown'));
  });

  it('переключатель показывает чужую раскладку и говорит об этом', async () => {
    const { host, plugin } = await raise();
    host.run('keys.show');
    plugin.window.viewHost.value = 'electron';
    expect(texts(plugin)).toContain('keys.elsewhere');
  });

  it('эхо нажатия приходит от ядра и видно сразу', async () => {
    const { host, plugin } = await raise();
    host.run('keys.show');
    host.plugin(KeymapPlugin).echo.lastKey.value = { key: 'meta+k', context: 'global', command: null, seq: 1 };
    const kbds = of(rendered(plugin), 'kbd').map((one) => String(one.props.children));
    expect(kbds[0]).toBe(keys.humanize('meta+k'));
  });
});
