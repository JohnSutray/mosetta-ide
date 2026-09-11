import { describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import NpmScripts from '../src/client.js';
import TerminalPlugin from '@mosetta/ide-plugin-terminal';
import UiPlugin from '@mosetta/ide-plugin-ui';

const NAME = '@mosetta/ide-plugin-npm-scripts';

async function raise() {
  const host = new FakeHost();
  host.add(UiPlugin, '@mosetta/ide-plugin-ui');
  host.add(TerminalPlugin, '@mosetta/ide-plugin-terminal');
  host.ide('@mosetta/ide-plugin-terminal').answers.set('list', () => []);
  host.ide('@mosetta/ide-plugin-terminal').answers.set('shells', () => []);
  const plugin = host.add(NpmScripts, NAME);
  host.ide(NAME).answers.set('list', () => []);
  host.ide(NAME).answers.set('managers', () => [
    { path: 'pnpm', name: 'pnpm', version: '9', suggested: true, current: true },
    { path: 'npm', name: 'npm', version: '10', suggested: false, current: false },
  ]);
  await host.start();
  return { host, plugin };
}

describe('пакетный менеджер', () => {
  it('без проекта не спрашивается, с проектом — приходит', async () => {
    const { host, plugin } = await raise();
    expect(plugin.managers.value).toEqual([]);
    host.surface.project.value = { id: '1', root: '/p', name: 'p', sessions: 1, held: [], openedAt: 0 };
    await new Promise((r) => setTimeout(r, 0));
    expect(plugin.managers.value.find((one) => one.current)?.name).toBe('pnpm');
  });

  it('выбор пишется в настройки под старым ключом `tools.packageManager`', async () => {
    const { host, plugin } = await raise();
    host.surface.project.value = { id: '1', root: '/p', name: 'p', sessions: 1, held: [], openedAt: 0 };
    host.run('scripts.packageManager');
    expect(plugin.managerPicker.value).toBe(true);
    await plugin.chooseManager('npm');
    expect(host.surface.settingWrites).toEqual([{ section: 'tools', key: 'packageManager', value: 'npm' }]);
    expect(plugin.managerPicker.value).toBe(false);
  });
});
