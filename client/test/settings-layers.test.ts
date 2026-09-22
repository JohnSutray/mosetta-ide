import { describe, expect, it } from 'vitest';
import { inLayerOrder, PROJECT_LAYER, settingsKey, USER_LAYER } from '@mosetta/ide-api/client';
import { overlay } from '@mosetta/ide-api/section';
import { Registry } from '../src/state/registry.js';
import { SettingsLayers } from '../src/state/settings-layers.js';

/**
 * Settings layers, as entries in a section's key: factory, the user's, the project's.
 * An entry's author is its layer, so "where does this value come from" is no longer
 * computed but read.
 */

const LSP_SCHEMA = {
  type: 'object',
  properties: {
    startOnOpen: { type: 'boolean' },
    checkProjectLimit: { type: 'number' },
    servers: { type: 'object' },
  },
  additionalProperties: false,
} as const;

const DEFAULTS = { startOnOpen: true, checkProjectLimit: 2000, servers: {} };

function stand() {
  const complaints: string[] = [];
  const store = new Registry((message) => complaints.push(message));
  store.declare(settingsKey('lsp'), '@mosetta/ide-plugin-lsp', LSP_SCHEMA);
  store.add(settingsKey('lsp'), DEFAULTS, '@mosetta/ide-plugin-lsp');
  return { store, complaints, layers: new SettingsLayers(store, (message) => complaints.push(message)) };
}

/** The same way the core reads a section: layers by AUTHOR, over the defaults. */
function fold(store: Registry, section: string, defaults: object): object {
  return inLayerOrder(store.entries<object>(settingsKey(section)).value).reduce<object>(
    (acc, one) => overlay(acc, one.value),
    defaults,
  );
}

describe('settings layers', () => {
  it('a layer lands as an entry with its own author, the project one over the personal', () => {
    const { store, layers } = stand();
    layers.apply(USER_LAYER, { lsp: { startOnOpen: false } });
    layers.apply(PROJECT_LAYER, { lsp: { checkProjectLimit: 50 } });

    expect(store.entries<object>(settingsKey('lsp')).value.map((one) => one.by)).toEqual([
      '@mosetta/ide-plugin-lsp',
      USER_LAYER,
      PROJECT_LAYER,
    ]);
    expect(fold(store, 'lsp', DEFAULTS)).toEqual({ startOnOpen: false, checkProjectLimit: 50, servers: {} });
  });

  it('a layer is re-read whole: a section that vanished leaves with its value', () => {
    const { store, layers } = stand();
    layers.apply(USER_LAYER, { lsp: { startOnOpen: false } });
    expect(fold(store, 'lsp', DEFAULTS)).toMatchObject({ startOnOpen: false });
    layers.apply(USER_LAYER, {});
    expect(store.entries(settingsKey('lsp')).value).toHaveLength(1);
    expect(fold(store, 'lsp', DEFAULTS)).toEqual(DEFAULTS);
  });

  it('a spoiled key is thrown out by name, the rest are applied', () => {
    const { store, layers, complaints } = stand();
    layers.apply(USER_LAYER, { lsp: { startOnOpen: 'yep', checkProjectLimit: 10 } });

    expect(fold(store, 'lsp', DEFAULTS)).toEqual({ startOnOpen: true, checkProjectLimit: 10, servers: {} });
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain(USER_LAYER);
    expect(complaints[0]).toContain('startOnOpen');
  });

  it('an unknown key is the wrong shape too, and it is named as well', () => {
    const { store, layers, complaints } = stand();
    layers.apply(PROJECT_LAYER, { lsp: { typo: 1, startOnOpen: false } });

    expect(fold(store, 'lsp', DEFAULTS)).toMatchObject({ startOnOpen: false });
    expect(complaints[0]).toContain('typo');
  });

  it('a section that is not an object is not applied at all', () => {
    const { store, layers, complaints } = stand();
    layers.apply(USER_LAYER, { lsp: 'a string' });

    expect(store.entries(settingsKey('lsp')).value).toHaveLength(1);
    expect(complaints[0]).toContain('not applying');
  });

  it('a section nobody declared lands as it is', () => {
    const { store, layers, complaints } = stand();
    layers.apply(USER_LAYER, { ownerless: { some: 'whatever' } });

    expect(store.entries<object>(settingsKey('ownerless')).value).toEqual([
      { by: USER_LAYER, value: { some: 'whatever' } },
    ]);
    expect(complaints).toEqual([]);
  });

  it('a plugin\'s factory defaults are checked by its own schema', () => {
    const complaints: string[] = [];
    const store = new Registry((message) => complaints.push(message));
    store.declare(settingsKey('toy'), '@mosetta/ide-plugin-toy', LSP_SCHEMA);
    store.add(settingsKey('toy'), { startOnOpen: 'yes' }, '@mosetta/ide-plugin-toy');

    expect(store.entries(settingsKey('toy')).value).toHaveLength(0);
    expect(complaints[0]).toContain('@mosetta/ide-plugin-toy');
  });

  it('the stack is ordered by AUTHOR rather than by who landed first', () => {
    const complaints: string[] = [];
    const store = new Registry((message) => complaints.push(message));
    store.declare(settingsKey('lsp'), '@mosetta/ide-plugin-lsp', LSP_SCHEMA);
    const layers = new SettingsLayers(store, (message) => complaints.push(message));
    layers.apply(USER_LAYER, { lsp: { startOnOpen: false } });
    store.add(settingsKey('lsp'), DEFAULTS, '@mosetta/ide-plugin-lsp');

    expect(
      store.entries(settingsKey('lsp')).value.map((one) => one.by),
      'in the registry mine landed first',
    ).toEqual([USER_LAYER, '@mosetta/ide-plugin-lsp']);
    expect(fold(store, 'lsp', DEFAULTS)).toMatchObject({ startOnOpen: false });
  });

  it('the project\'s beats mine, and mine beats factory', () => {
    const stack = [
      { by: PROJECT_LAYER, value: 3 },
      { by: '@mosetta/ide-plugin-lsp', value: 1 },
      { by: USER_LAYER, value: 2 },
    ];
    expect(inLayerOrder(stack).map((one) => one.value)).toEqual([1, 2, 3]);
  });
});
