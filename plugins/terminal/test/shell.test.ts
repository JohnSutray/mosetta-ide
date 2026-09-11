import { describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import TerminalPlugin from '../src/client.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

const NAME = '@mosetta/ide-plugin-terminal';

async function raise() {
  const host = new FakeHost();
  host.add(UiPlugin, '@mosetta/ide-plugin-ui');
  const plugin = host.add(TerminalPlugin, NAME);
  host.ide(NAME).answers.set('list', () => []);
  host.ide(NAME).answers.set('shells', () => [
    { path: '/bin/zsh', name: 'zsh', ref: 'zsh', current: true },
    { path: '/bin/bash', name: 'bash', ref: 'bash', current: false },
  ]);
  await host.start();
  await new Promise((r) => setTimeout(r, 0));
  return { host, plugin };
}

describe('оболочка терминала', () => {
  it('плашка подписана тем, что в работе', async () => {
    const { plugin } = await raise();
    expect(plugin.shells.value.find((one) => one.current)?.name).toBe('zsh');
  });

  it('клавиша открывает и закрывает окно выбора', async () => {
    const { host, plugin } = await raise();
    host.run('terminal.shell');
    expect(plugin.shellPicker.value).toBe(true);
    host.run('terminal.shell');
    expect(plugin.shellPicker.value).toBe(false);
  });

  it('выбор пишется в настройки ядром, окно закрывается', async () => {
    const { host, plugin } = await raise();
    host.run('terminal.shell');
    await plugin.chooseShell('bash');
    expect(host.surface.settingWrites).toEqual([{ section: 'terminal', key: 'shell', value: 'bash' }]);
    expect(plugin.shellPicker.value).toBe(false);
  });

  it('сервер не ответил — говорим вслух, а не показываем пустоту', async () => {
    const host = new FakeHost();
    host.add(UiPlugin, '@mosetta/ide-plugin-ui');
    const plugin = host.add(TerminalPlugin, NAME);
    host.ide(NAME).answers.set('list', () => []);
    host.ide(NAME).answers.set('shells', () => {
      throw new Error('старый сервер');
    });
    await host.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(plugin.shells.value).toEqual([]);
    expect(host.ide(NAME).complaints.some((one) => one.includes('старый сервер'))).toBe(true);
  });
});
