import { describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import NpmScripts from '../src/client.js';
import TerminalPlugin from '@mosetta/ide-plugin-terminal';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * What to run scripts with — the SCRIPTS window.
 *
 * The manager is about the project: without a project it is not asked for, and with one
 * it is asked of our own server half. The choice is written by the core into
 * `tools.packageManager`.
 */
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

describe('the package manager', () => {
  it('without a project it is not asked for; with one it arrives', async () => {
    const { host, plugin } = await raise();
    expect(plugin.managers.value).toEqual([]);
    host.surface.project.value = { id: '1', root: '/p', name: 'p', sessions: 1, held: [], openedAt: 0 };
    await new Promise((r) => setTimeout(r, 0));
    expect(plugin.managers.value.find((one) => one.current)?.name).toBe('pnpm');
  });

  it('the choice is written into the settings under the key `tools.packageManager`', async () => {
    const { host, plugin } = await raise();
    host.surface.project.value = { id: '1', root: '/p', name: 'p', sessions: 1, held: [], openedAt: 0 };
    host.run('scripts.packageManager');
    expect(plugin.managerPicker.value).toBe(true);
    await plugin.chooseManager('npm');
    expect(host.surface.settingWrites).toEqual([{ section: 'tools', key: 'packageManager', value: 'npm' }]);
    expect(plugin.managerPicker.value).toBe(false);
  });
});
