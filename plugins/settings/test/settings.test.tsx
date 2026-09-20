import { describe, expect, it } from 'vitest';
import { configSection, plugin, PROJECT_LAYER, USER_LAYER, type SettingsEntry } from '@mosetta/ide-api/client';
import { FakeHost } from '@mosetta/ide-api/testing';
import UiPlugin from '@mosetta/ide-plugin-ui';
import SettingsPlugin from '../src/client.js';
import { SettingsModel, SettingsWindow } from '../src/state.js';

/**
 * The settings editor: what it shows — groups by owner, the kind of field inferred from
 * the default, yours against factory — and how it is called.
 */
@plugin({ title: 'plugin.toy' })
@configSection({
  section: 'toy',
  defaults: { on: true, size: 12, name: 'x', masks: ['*.ts'], mode: 'fast', servers: {} },
  fields: { mode: { options: ['fast', 'slow'] } },
})
class Toy {
  constructor(_ide: unknown) {}
}

async function raise() {
  const host = new FakeHost();
  host.add(UiPlugin, '@mosetta/ide-plugin-ui');
  host.add(Toy, '@mosetta/ide-plugin-toy');
  const settings = host.add(SettingsPlugin, '@mosetta/ide-plugin-settings');
  await host.start();
  return { host, settings, entries: host.registry.all<SettingsEntry>('settings') };
}

describe('the settings editor', () => {
  it('the host writes the section owner and its name into the registry', async () => {
    const { entries } = await raise();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ section: 'toy', owner: '@mosetta/ide-plugin-toy', title: 'plugin.toy' });
  });

  /**
   * A section's layers as the registry hands them over: the factory one is put there by
   * the plugin, the files' by the core.
   */
  function layers(user?: object, project?: object) {
    return () => [
      ...(user ? [{ by: USER_LAYER, value: user }] : []),
      ...(project ? [{ by: PROJECT_LAYER, value: project }] : []),
    ];
  }

  it('the kind of field is inferred from the default, and options make a choice', async () => {
    const { entries } = await raise();
    const [group] = new SettingsModel().groups(entries, layers());
    expect(group!.title).toBe('plugin.toy');
    expect(Object.fromEntries(group!.rows.map((row) => [row.key, row.kind]))).toEqual({
      on: 'boolean',
      size: 'number',
      name: 'string',
      masks: 'list',
      mode: 'choice',
      servers: 'object',
    });
    expect(group!.rows.find((row) => row.key === 'size')).toMatchObject({ path: 'toy.size', label: 'settings.toy.size', value: 12, overridden: false });
  });

  it('a value of your own comes from the file and is marked; only it has anything to reset', async () => {
    const { entries } = await raise();
    const [group] = new SettingsModel().groups(entries, layers({ size: 14 }));
    const size = group!.rows.find((row) => row.key === 'size')!;
    expect(size).toMatchObject({ value: 14, fallback: 12, overridden: true });
    expect(group!.rows.filter((row) => row.overridden).map((row) => row.key)).toEqual(['size']);
  });

  it('a project value beats the personal one, and the layer shows it', async () => {
    const { entries } = await raise();
    const [group] = new SettingsModel().groups(entries, layers({ size: 14, name: 'mine' }, { size: 21 }));
    const rows = Object.fromEntries(group!.rows.map((row) => [row.key, row]));
    expect(rows.size, 'the project\'s wins').toMatchObject({ value: 21, at: 'project', overridden: true });
    expect(rows.name, 'the personal one where the project says nothing').toMatchObject({ value: 'mine', at: 'user', overridden: true });
    expect(rows.on, 'what nobody touched is factory').toMatchObject({ value: true, at: 'default', overridden: false });
  });

  it('no project — two layers', async () => {
    const { entries } = await raise();
    const [group] = new SettingsModel().groups(entries, layers({ size: 14 }));
    const rows = Object.fromEntries(group!.rows.map((row) => [row.key, row]));
    expect(rows.size).toMatchObject({ value: 14, at: 'user' });
    expect(rows.name).toMatchObject({ at: 'default' });
  });

  it('the search goes by label and by path', async () => {
    const { entries } = await raise();
    const model = new SettingsModel();
    const groups = model.groups(entries, layers());
    const label = (row: { key: string }) => (row.key === 'on' ? 'Turn it on' : row.key);
    expect(model.filter(groups, 'toy.mas', label)[0]!.rows.map((row) => row.key)).toEqual(['masks']);
    expect(model.filter(groups, 'turn', label)[0]!.rows.map((row) => row.key)).toEqual(['on']);
    expect(model.filter(groups, 'no such thing', label)).toEqual([]);
  });

  it('a list of strings — one line per element, and empty ones do not count', () => {
    expect(new SettingsModel().lines(' *.ts \n\n*.tsx\n')).toEqual(['*.ts', '*.tsx']);
  });

  it('what was found is cut into pieces — we are going to highlight with a backing', () => {
    const model = new SettingsModel();
    expect(model.split('editor.fontSize', '')).toEqual([{ text: 'editor.fontSize', hit: false }]);
    expect(model.split('editor.fontSize', 'font')).toEqual([
      { text: 'editor.', hit: false },
      { text: 'font', hit: true },
      { text: 'Size', hit: false },
    ]);
    expect(model.split('Font family', 'fa'), 'we search without regard for case').toEqual([
      { text: 'Font ', hit: false },
      { text: 'fa', hit: true },
      { text: 'mily', hit: false },
    ]);
    expect(model.split('tools.tools', 'tools'), 'there may be several matches').toEqual([
      { text: 'tools', hit: true },
      { text: '.', hit: false },
      { text: 'tools', hit: true },
    ]);
    expect(model.split('editor.fontSize', 'no such thing')).toEqual([{ text: 'editor.fontSize', hit: false }]);
  });

  it('the window is called by a command and by a toolbar button; its own key closes it', async () => {
    const { host, settings } = await raise();
    expect(host.registry.all<{ id: string; command: string }>('toolbar.button').find((one) => one.id === 'settings')?.command).toBe('settings.show');
    host.run('settings.show');
    expect(settings.window.open.value).toBe(true);
    settings.window.term.value = 'size';
    host.run('settings.show');
    expect(settings.window.open.value).toBe(false);
    expect(settings.window.term.value, 'the search does not survive a close').toBe('');
  });

  it('the sections are collapsed by default; a search expands them all', () => {
    const win = new SettingsWindow();
    expect(win.isOpen('@mosetta/ide-plugin-git')).toBe(false);
    win.toggleGroup('@mosetta/ide-plugin-git');
    expect(win.isOpen('@mosetta/ide-plugin-git')).toBe(true);
    expect(win.isOpen('@mosetta/ide-plugin-lsp')).toBe(false);
    win.term.value = 'font';
    expect(win.isOpen('@mosetta/ide-plugin-lsp')).toBe(true);
    win.toggleGroup('@mosetta/ide-plugin-git');
    win.term.value = '';
    expect(win.isOpen('@mosetta/ide-plugin-git')).toBe(false);
  });
});
