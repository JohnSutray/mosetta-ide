import { describe, expect, it } from 'vitest';
import { Registry } from '../src/state/registry.js';

function store() {
  const complaints: string[] = [];
  return { registry: new Registry((message) => complaints.push(message)), complaints };
}

const BUTTON = {
  type: 'object',
  required: ['id', 'command'],
  properties: { id: { type: 'string' }, command: { type: 'string' } },
  additionalProperties: false,
} as const;

describe('реестр', () => {
  it('кто написал, тот и лежит', () => {
    const { registry, complaints } = store();
    registry.declare('toolbar.button', 'core', BUTTON);
    registry.add('toolbar.button', { id: 'tree', command: 'panel.tree' }, 'core');
    expect(registry.all('toolbar.button').value).toEqual([{ id: 'tree', command: 'panel.tree' }]);
    expect(complaints).toEqual([]);
  });

  it('писателю не положено ждать читателя', () => {
    const { registry, complaints } = store();
    registry.add('toolbar.button', { id: 'tree' }, '@mosetta/ide-plugin-ранний');
    expect(complaints).toEqual([]);
    registry.declare('toolbar.button', 'core', BUTTON);
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain('@mosetta/ide-plugin-ранний');
  });

  it('в ключ без схемы можно писать что угодно', () => {
    const { registry, complaints } = store();
    registry.add('чего-нибудь', { какое: 'угодно' }, '@mosetta/ide-plugin-чей-то');
    expect(registry.all('чего-нибудь').value).toHaveLength(1);
    expect(complaints).toEqual([]);
  });

  it('отказ называет автора, ключ И ПОЛЕ', () => {
    const { registry, complaints } = store();
    registry.declare('toolbar.button', 'core', BUTTON);
    registry.add('toolbar.button', { id: 'tree', comand: 'panel.tree' }, '@mosetta/ide-plugin-tree');
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain('@mosetta/ide-plugin-tree');
    expect(complaints[0]).toContain('toolbar.button');
    expect(complaints[0]).toContain('«command»');
    expect(complaints[0]).toContain('«comand»');
  });

  it('запись не той формы НЕ ложится (ADR-0215)', () => {
    const { registry, complaints } = store();
    registry.declare('toolbar.button', 'core', BUTTON);
    registry.add('toolbar.button', { id: 'tree' }, '@mosetta/ide-plugin-tree');
    expect(registry.all('toolbar.button').value).toHaveLength(0);
    expect(complaints).toHaveLength(1);
  });

  it('запись, легшая до схемы, уходит, когда схема пришла', () => {
    const { registry, complaints } = store();
    registry.add('toolbar.button', { id: 'tree', command: 'panel.tree' }, '@mosetta/ide-plugin-tree');
    registry.add('toolbar.button', { id: 'git' }, '@mosetta/ide-plugin-git');
    registry.declare('toolbar.button', 'core', BUTTON);
    expect(registry.all<{ id: string }>('toolbar.button').value.map((one) => one.id)).toEqual(['tree']);
    expect(complaints[0]).toContain('@mosetta/ide-plugin-git');
  });

  it('авторство записи видно отдельно от значения', () => {
    const { registry } = store();
    registry.add('settings.lsp', { startOnOpen: true }, '@mosetta/ide-plugin-lsp');
    registry.add('settings.lsp', { startOnOpen: false }, 'settings.json');
    expect(registry.entries<{ startOnOpen: boolean }>('settings.lsp').value).toEqual([
      { by: '@mosetta/ide-plugin-lsp', value: { startOnOpen: true } },
      { by: 'settings.json', value: { startOnOpen: false } },
    ]);
  });

  it('две схемы на один ключ — жалоба с именем первого', () => {
    const { registry, complaints } = store();
    registry.declare('toolbar.button', 'core', BUTTON);
    registry.declare('toolbar.button', '@mosetta/ide-plugin-второй', { type: 'string' });
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain('core');
    registry.add('toolbar.button', 'строка', '@mosetta/ide-plugin-второй');
    expect(complaints).toHaveLength(2);
  });

  it('запись снимается тем, что вернул add', () => {
    const { registry } = store();
    const off = registry.add('chrome.top', 'первый', 'core');
    registry.add('chrome.top', 'второй', 'core');
    off();
    expect(registry.all('chrome.top').value).toEqual(['второй']);
    off();
    expect(registry.all('chrome.top').value).toEqual(['второй']);
  });

  it('вид на ключ один и тот же', () => {
    const { registry } = store();
    expect(registry.all('chrome.top')).toBe(registry.all('chrome.top'));
  });

  it('вид живой: подписчик видит дописанное', () => {
    const { registry } = store();
    const view = registry.all<string>('chrome.top');
    expect(view.value).toEqual([]);
    registry.add('chrome.top', 'первый', 'core');
    expect(view.value).toEqual(['первый']);
  });

  it('рассказывает о себе: ключи, схемы, счёт', () => {
    const { registry } = store();
    registry.declare('toolbar.button', 'core', BUTTON);
    registry.add('toolbar.button', { id: 'tree', command: 'panel.tree' }, 'core');
    registry.add('chrome.top', 'вид', '@mosetta/ide-plugin-toolbar');
    expect(registry.describe()).toEqual([
      { key: 'chrome.top', count: 1 },
      { key: 'toolbar.button', schema: BUTTON, declaredBy: 'core', count: 1 },
    ]);
  });
});
