import { describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import TerminalPlugin from '../src/client.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * What to open a terminal with — the TERMINAL's window.
 *
 * The `terminal.shell` setting is its, the list of shells comes from its own server
 * half, and the choice is written by the core. The window is shared, but what is in it
 * and what it means is here.
 */
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

describe('the terminal\'s shell', () => {
  it('the badge is captioned with what is in use', async () => {
    const { plugin } = await raise();
    expect(plugin.shells.value.find((one) => one.current)?.name).toBe('zsh');
  });

  it('the key opens and closes the choice window', async () => {
    const { host, plugin } = await raise();
    host.run('terminal.shell');
    expect(plugin.shellPicker.value).toBe(true);
    host.run('terminal.shell');
    expect(plugin.shellPicker.value).toBe(false);
  });

  it('the choice is written into the settings by the core, and the window closes', async () => {
    const { host, plugin } = await raise();
    host.run('terminal.shell');
    await plugin.chooseShell('bash');
    expect(host.surface.settingWrites).toEqual([{ section: 'terminal', key: 'shell', value: 'bash' }]);
    expect(plugin.shellPicker.value).toBe(false);
  });

  it('the server did not answer — we say so out loud rather than showing emptiness', async () => {
    const host = new FakeHost();
    host.add(UiPlugin, '@mosetta/ide-plugin-ui');
    const plugin = host.add(TerminalPlugin, NAME);
    host.ide(NAME).answers.set('list', () => []);
    host.ide(NAME).answers.set('shells', () => {
      throw new Error('an old server');
    });
    await host.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(plugin.shells.value).toEqual([]);
    expect(host.ide(NAME).complaints.some((one) => one.includes('an old server'))).toBe(true);
  });
});
