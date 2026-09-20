import { describe, expect, it } from 'vitest';
import { PROJECT_LAYER, settingsKey, USER_LAYER, type SettingsEntry } from '@mosetta/ide-api/client';
import { Registry } from '../src/state/registry.js';
import { SettingsWrite } from '../src/state/settings-write.js';

/**
 * Writing a setting is validated by the very thing that reads the file.
 *
 * The check used to sit only on reading: the schema caught what a human wrote by hand
 * and let through what the IDE wrote itself. `typeof` did not close the hole — it is
 * the same for a list of strings and a list of numbers.
 */
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

describe('validating a setting write', () => {
  it('a value of your own of the same kind is allowed', () => {
    const { write } = stand();
    expect(write.complain('find', 'maxHits', 200, USER_LAYER)).toBeNull();
    expect(write.complain('find', 'masks', ['*.ts'], USER_LAYER)).toBeNull();
  });

  it('there is nothing to write into a section nobody declared', () => {
    const { write } = stand();
    expect(write.complain('nobodys', 'x', 1, USER_LAYER)).toContain('no plugin declared');
  });

  it('the key is not in the defaults — refused, by name', () => {
    const { write } = stand();
    expect(write.complain('find', 'maxHitz', 1, USER_LAYER)).toContain('find.maxHitz');
  });

  it('a list of NUMBERS instead of a list of strings is caught by the schema rather than by typeof', () => {
    const { write } = stand();
    const no = write.complain('find', 'masks', [1, 2] as never, USER_LAYER);
    expect(no).toContain('masks');
    expect(no).toContain('string');
  });

  it('the FUTURE layer is validated rather than one value', () => {
    const { store, write } = stand();
    store.add(settingsKey('find'), { maxHits: 10 }, PROJECT_LAYER);
    expect(write.complain('find', 'masks', ['*.ts'], PROJECT_LAYER)).toBeNull();
    store.add(settingsKey('find'), { extra: 1 } as never, USER_LAYER);
    expect(store.entries(settingsKey('find')).value.some((one) => one.by === USER_LAYER)).toBe(false);
    expect(write.complain('find', 'maxHits', 5, USER_LAYER)).toBeNull();
  });

  it('a section without a schema is validated the old way: by its declaration and its type', () => {
    const complaints: string[] = [];
    const store = new Registry((message) => complaints.push(message));
    store.add<SettingsEntry>(
      'settings',
      { section: 'toy', defaults: { size: 1 }, owner: '@x/toy', title: 'plugin.toy' },
      '@x/toy',
    );
    const write = new SettingsWrite(store);
    expect(write.complain('toy', 'size', 7, USER_LAYER)).toBeNull();
    expect(write.complain('toy', 'size', 'seven', USER_LAYER)).toContain('expects number');
  });
});
