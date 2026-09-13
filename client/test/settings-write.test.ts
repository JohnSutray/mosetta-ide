import { describe, expect, it } from 'vitest';
import { PROJECT_LAYER, settingsKey, USER_LAYER, type SettingsEntry } from '@mosetta/ide-api/client';
import { Registry } from '../src/state/registry.js';
import { SettingsWrite } from '../src/state/settings-write.js';

const FIND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    masks: { type: 'array', items: { type: 'string' } },
    maxHits: { type: 'number' },
  },
} as const;

const DECLARED: SettingsEntry = {
  section: 'find',
  defaults: { masks: [], maxHits: 500 },
  schema: FIND_SCHEMA,
  owner: '@mosetta/ide-plugin-find',
  title: 'plugin.find',
};

function stand() {
  const complaints: string[] = [];
  const store = new Registry((message) => complaints.push(message));
  store.declare('settings', 'core');
  store.add<SettingsEntry>('settings', DECLARED, 'core');
  store.declare(settingsKey('find'), '@mosetta/ide-plugin-find', FIND_SCHEMA);
  store.add(settingsKey('find'), DECLARED.defaults, '@mosetta/ide-plugin-find');
  return { store, write: new SettingsWrite(store), complaints };
}

describe('проверка записи настройки', () => {
  it('своё значение того же сорта — можно', () => {
    const { write } = stand();
    expect(write.complain('find', 'maxHits', 200, USER_LAYER)).toBeNull();
    expect(write.complain('find', 'masks', ['*.ts'], USER_LAYER)).toBeNull();
  });

  it('раздел, которого никто не объявил, писать нечем', () => {
    const { write } = stand();
    expect(write.complain('ничей', 'x', 1, USER_LAYER)).toContain('никто не объявил');
  });

  it('ключа нет в умолчаниях — отказ с именем', () => {
    const { write } = stand();
    expect(write.complain('find', 'maxHitz', 1, USER_LAYER)).toContain('find.maxHitz');
  });

  it('список ЧИСЕЛ вместо списка строк ловит схема, а не typeof', () => {
    const { write } = stand();
    const no = write.complain('find', 'masks', [1, 2] as never, USER_LAYER);
    expect(no).toContain('masks');
    expect(no).toContain('string');
  });

  it('проверяется БУДУЩИЙ слой, а не одно значение', () => {
    const { store, write } = stand();
    store.add(settingsKey('find'), { maxHits: 10 }, PROJECT_LAYER);
    expect(write.complain('find', 'masks', ['*.ts'], PROJECT_LAYER)).toBeNull();
    store.add(settingsKey('find'), { лишнее: 1 } as never, USER_LAYER);
    expect(store.entries(settingsKey('find')).value.some((one) => one.by === USER_LAYER)).toBe(false);
    expect(write.complain('find', 'maxHits', 5, USER_LAYER)).toBeNull();
  });

  it('раздел без схемы проверяется по-старому: объявлением и типом', () => {
    const complaints: string[] = [];
    const store = new Registry((message) => complaints.push(message));
    store.add<SettingsEntry>(
      'settings',
      { section: 'toy', defaults: { size: 1 }, owner: '@x/toy', title: 'plugin.toy' },
      '@x/toy',
    );
    const write = new SettingsWrite(store);
    expect(write.complain('toy', 'size', 7, USER_LAYER)).toBeNull();
    expect(write.complain('toy', 'size', 'семь', USER_LAYER)).toContain('ждёт number');
  });
});
