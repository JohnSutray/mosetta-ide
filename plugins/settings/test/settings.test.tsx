import { describe, expect, it } from 'vitest';
import { configSection, plugin, type SettingsEntry } from '@mosetta/ide-api/client';
import { FakeHost } from '@mosetta/ide-api/testing';
import UiPlugin from '@mosetta/ide-plugin-ui';
import SettingsPlugin from '../src/client.js';
import { SettingsModel, SettingsWindow } from '../src/state.js';

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

describe('редактор настроек', () => {
  it('хост пишет в реестр владельца раздела и его название', async () => {
    const { entries } = await raise();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ section: 'toy', owner: '@mosetta/ide-plugin-toy', title: 'plugin.toy' });
  });

  it('вид поля выводится из умолчания, варианты делают выбор', async () => {
    const { entries } = await raise();
    const [group] = new SettingsModel().groups(entries, null, {});
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

  it('своё значение — из файла и помечено; сбрасывать есть что только у него', async () => {
    const { entries } = await raise();
    const [group] = new SettingsModel().groups(entries, { toy: { size: 14 } }, { toy: { size: 14 } });
    const size = group!.rows.find((row) => row.key === 'size')!;
    expect(size).toMatchObject({ value: 14, fallback: 12, overridden: true });
    expect(group!.rows.filter((row) => row.overridden).map((row) => row.key)).toEqual(['size']);
  });

  it('проектное значение перебивает личное, и это видно по слою', async () => {
    const { entries } = await raise();
    const [group] = new SettingsModel().groups(
      entries,
      { toy: { size: 14 } },
      { toy: { size: 14, name: 'моё' } },
      { toy: { size: 21 } },
    );
    const rows = Object.fromEntries(group!.rows.map((row) => [row.key, row]));
    expect(rows.size, 'проектное побеждает').toMatchObject({ value: 21, at: 'project', overridden: true });
    expect(rows.name, 'личное — там, где проект молчит').toMatchObject({ value: 'моё', at: 'user', overridden: true });
    expect(rows.on, 'нетронутое — заводское').toMatchObject({ value: true, at: 'default', overridden: false });
  });

  it('проекта нет — слоёв два', async () => {
    const { entries } = await raise();
    const [group] = new SettingsModel().groups(entries, null, { toy: { size: 14 } });
    const rows = Object.fromEntries(group!.rows.map((row) => [row.key, row]));
    expect(rows.size).toMatchObject({ value: 14, at: 'user' });
    expect(rows.name).toMatchObject({ at: 'default' });
  });

  it('поиск — по надписи и по пути', async () => {
    const { entries } = await raise();
    const model = new SettingsModel();
    const groups = model.groups(entries, null, {});
    const label = (row: { key: string }) => (row.key === 'on' ? 'Turn it on' : row.key);
    expect(model.filter(groups, 'toy.mas', label)[0]!.rows.map((row) => row.key)).toEqual(['masks']);
    expect(model.filter(groups, 'turn', label)[0]!.rows.map((row) => row.key)).toEqual(['on']);
    expect(model.filter(groups, 'нет такого', label)).toEqual([]);
  });

  it('список строк — строка на элемент, пустые не в счёт', () => {
    expect(new SettingsModel().lines(' *.ts \n\n*.tsx\n')).toEqual(['*.ts', '*.tsx']);
  });

  it('найденное режется на куски — подсвечивать будем подложкой', () => {
    const model = new SettingsModel();
    expect(model.split('editor.fontSize', '')).toEqual([{ text: 'editor.fontSize', hit: false }]);
    expect(model.split('editor.fontSize', 'font')).toEqual([
      { text: 'editor.', hit: false },
      { text: 'font', hit: true },
      { text: 'Size', hit: false },
    ]);
    expect(model.split('Font family', 'fa'), 'ищем без оглядки на регистр').toEqual([
      { text: 'Font ', hit: false },
      { text: 'fa', hit: true },
      { text: 'mily', hit: false },
    ]);
    expect(model.split('tools.tools', 'tools'), 'совпадений может быть несколько').toEqual([
      { text: 'tools', hit: true },
      { text: '.', hit: false },
      { text: 'tools', hit: true },
    ]);
    expect(model.split('editor.fontSize', 'нет такого')).toEqual([{ text: 'editor.fontSize', hit: false }]);
  });

  it('окно зовётся командой и кнопкой тулбара; своя клавиша закрывает', async () => {
    const { host, settings } = await raise();
    expect(host.registry.all<{ id: string; command: string }>('toolbar.button').find((one) => one.id === 'settings')?.command).toBe('settings.show');
    host.run('settings.show');
    expect(settings.window.open.value).toBe(true);
    settings.window.term.value = 'size';
    host.run('settings.show');
    expect(settings.window.open.value).toBe(false);
    expect(settings.window.term.value, 'поиск не переживает закрытие').toBe('');
  });

  it('секции свёрнуты по умолчанию; поиск раскрывает все', () => {
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
