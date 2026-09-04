import { describe, expect, it } from 'vitest';
import { FakeHost, nodes, of } from '@ide/api/testing';
import KeysPlugin from '../src/client.js';
import { KeysPopup } from '../src/popup.js';

async function raise() {
  const host = new FakeHost();
  const plugin = host.add(KeysPlugin, '@ide/plugin-keys');
  await host.start();
  host.surface.keyBindings.value = [
    { command: 'file.save', key: 'meta+s', where: ['browser:mac', 'electron:mac'] },
    { command: 'file.save', key: 'control+s', where: ['browser:win', 'electron:win'] },
    { command: 'tree.next', key: 'arrowdown', when: 'tree' },
  ];
  return { host, plugin };
}

function rendered(plugin: KeysPlugin) {
  return nodes(KeysPopup({ window: plugin.window }));
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
    expect(kbds).toContain('meta+s');
    expect(kbds).not.toContain('control+s');
    expect(kbds).toContain('arrowdown');
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
    host.surface.keyEcho.value = { key: 'meta+k', context: 'global', command: null, seq: 1 };
    const kbds = of(rendered(plugin), 'kbd').map((one) => String(one.props.children));
    expect(kbds[0]).toBe('meta+k');
  });
});
