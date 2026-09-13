import { describe, expect, it } from 'vitest';
import { inLayerOrder, PROJECT_LAYER, settingsKey, USER_LAYER } from '@mosetta/ide-api/client';
import { overlay } from '@mosetta/ide-api/section';
import { Registry } from '../src/state/registry.js';
import { SettingsLayers } from '../src/state/settings-layers.js';

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

function fold(store: Registry, section: string, defaults: object): object {
  return inLayerOrder(store.entries<object>(settingsKey(section)).value).reduce<object>(
    (acc, one) => overlay(acc, one.value),
    defaults,
  );
}

describe('слои настроек', () => {
  it('слой ложится записью со своим автором, проектный поверх личного', () => {
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

  it('слой перечитывается целиком: пропавший раздел уходит вместе со своим значением', () => {
    const { store, layers } = stand();
    layers.apply(USER_LAYER, { lsp: { startOnOpen: false } });
    expect(fold(store, 'lsp', DEFAULTS)).toMatchObject({ startOnOpen: false });
    layers.apply(USER_LAYER, {});
    expect(store.entries(settingsKey('lsp')).value).toHaveLength(1);
    expect(fold(store, 'lsp', DEFAULTS)).toEqual(DEFAULTS);
  });

  it('испорченный ключ выбрасывается поимённо, остальные применяются', () => {
    const { store, layers, complaints } = stand();
    layers.apply(USER_LAYER, { lsp: { startOnOpen: 'ага', checkProjectLimit: 10 } });

    expect(fold(store, 'lsp', DEFAULTS)).toEqual({ startOnOpen: true, checkProjectLimit: 10, servers: {} });
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain(USER_LAYER);
    expect(complaints[0]).toContain('startOnOpen');
  });

  it('лишний ключ — тоже не та форма, и тоже назван', () => {
    const { store, layers, complaints } = stand();
    layers.apply(PROJECT_LAYER, { lsp: { опечатка: 1, startOnOpen: false } });

    expect(fold(store, 'lsp', DEFAULTS)).toMatchObject({ startOnOpen: false });
    expect(complaints[0]).toContain('опечатка');
  });

  it('раздел не объект — не применяем вовсе', () => {
    const { store, layers, complaints } = stand();
    layers.apply(USER_LAYER, { lsp: 'строка' });

    expect(store.entries(settingsKey('lsp')).value).toHaveLength(1);
    expect(complaints[0]).toContain('не применяю');
  });

  it('раздел, которого никто не объявил, ложится как есть', () => {
    const { store, layers, complaints } = stand();
    layers.apply(USER_LAYER, { ничейный: { что: 'угодно' } });

    expect(store.entries<object>(settingsKey('ничейный')).value).toEqual([
      { by: USER_LAYER, value: { что: 'угодно' } },
    ]);
    expect(complaints).toEqual([]);
  });

  it('заводские умолчания плагина проверяются его же схемой', () => {
    const complaints: string[] = [];
    const store = new Registry((message) => complaints.push(message));
    store.declare(settingsKey('toy'), '@mosetta/ide-plugin-toy', LSP_SCHEMA);
    store.add(settingsKey('toy'), { startOnOpen: 'да' }, '@mosetta/ide-plugin-toy');

    expect(store.entries(settingsKey('toy')).value).toHaveLength(0);
    expect(complaints[0]).toContain('@mosetta/ide-plugin-toy');
  });

  it('стопка выстраивается по АВТОРУ, а не по тому, кто лёг первым', () => {
    const complaints: string[] = [];
    const store = new Registry((message) => complaints.push(message));
    store.declare(settingsKey('lsp'), '@mosetta/ide-plugin-lsp', LSP_SCHEMA);
    const layers = new SettingsLayers(store, (message) => complaints.push(message));
    layers.apply(USER_LAYER, { lsp: { startOnOpen: false } });
    store.add(settingsKey('lsp'), DEFAULTS, '@mosetta/ide-plugin-lsp');

    expect(
      store.entries(settingsKey('lsp')).value.map((one) => one.by),
      'в реестре они легли моим слоем вперёд',
    ).toEqual([USER_LAYER, '@mosetta/ide-plugin-lsp']);
    expect(fold(store, 'lsp', DEFAULTS)).toMatchObject({ startOnOpen: false });
  });

  it('проектное сильнее моего, а моё — заводского', () => {
    const stack = [
      { by: PROJECT_LAYER, value: 3 },
      { by: '@mosetta/ide-plugin-lsp', value: 1 },
      { by: USER_LAYER, value: 2 },
    ];
    expect(inLayerOrder(stack).map((one) => one.value)).toEqual([1, 2, 3]);
  });
});
