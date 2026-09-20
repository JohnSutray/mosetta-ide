import { describe, expect, it } from 'vitest';
import { Registry } from '../src/state/registry.js';

/**
 * The core's registry — the mechanism the whole plugin build rests on, and until now
 * nothing checked it at all.
 *
 * Checked from here rather than from a plugin. The plugin harness has its own,
 * deliberately stupid one: dragging the real one into the contract would mean adding an
 * export a plugin could import and silently get a second copy of, with second signals.
 * The price is one duplicated wording of a refusal, and that wording is what gets
 * compared here, word for word.
 */

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

describe('the registry', () => {
  it('whoever wrote it is who lies there', () => {
    const { registry, complaints } = store();
    registry.declare('toolbar.button', 'core', BUTTON);
    registry.add('toolbar.button', { id: 'tree', command: 'panel.tree' }, 'core');
    expect(registry.all('toolbar.button').value).toEqual([{ id: 'tree', command: 'panel.tree' }]);
    expect(complaints).toEqual([]);
  });

  it('a writer is not required to wait for a reader', () => {
    const { registry, complaints } = store();
    registry.add('toolbar.button', { id: 'tree' }, '@mosetta/ide-plugin-early');
    expect(complaints).toEqual([]);
    registry.declare('toolbar.button', 'core', BUTTON);
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain('@mosetta/ide-plugin-early');
  });

  it('anything may be written into a key without a schema', () => {
    const { registry, complaints } = store();
    registry.add('anything-at-all', { some: 'whatever' }, '@mosetta/ide-plugin-someone');
    expect(registry.all('anything-at-all').value).toHaveLength(1);
    expect(complaints).toEqual([]);
  });

  it('a refusal names the author, the key AND THE FIELD', () => {
    const { registry, complaints } = store();
    registry.declare('toolbar.button', 'core', BUTTON);
    registry.add('toolbar.button', { id: 'tree', comand: 'panel.tree' }, '@mosetta/ide-plugin-tree');
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain('@mosetta/ide-plugin-tree');
    expect(complaints[0]).toContain('toolbar.button');
    expect(complaints[0]).toContain('«command»');
    expect(complaints[0]).toContain('«comand»');
  });

  it('an entry of the wrong shape is NOT put in', () => {
    const { registry, complaints } = store();
    registry.declare('toolbar.button', 'core', BUTTON);
    registry.add('toolbar.button', { id: 'tree' }, '@mosetta/ide-plugin-tree');
    expect(registry.all('toolbar.button').value).toHaveLength(0);
    expect(complaints).toHaveLength(1);
  });

  it('an entry that landed before the schema leaves once the schema arrives', () => {
    const { registry, complaints } = store();
    registry.add('toolbar.button', { id: 'tree', command: 'panel.tree' }, '@mosetta/ide-plugin-tree');
    registry.add('toolbar.button', { id: 'git' }, '@mosetta/ide-plugin-git');
    registry.declare('toolbar.button', 'core', BUTTON);
    expect(registry.all<{ id: string }>('toolbar.button').value.map((one) => one.id)).toEqual(['tree']);
    expect(complaints[0]).toContain('@mosetta/ide-plugin-git');
  });

  it('an entry\'s author is visible apart from its value', () => {
    const { registry } = store();
    registry.add('settings.lsp', { startOnOpen: true }, '@mosetta/ide-plugin-lsp');
    registry.add('settings.lsp', { startOnOpen: false }, 'settings.json');
    expect(registry.entries<{ startOnOpen: boolean }>('settings.lsp').value).toEqual([
      { by: '@mosetta/ide-plugin-lsp', value: { startOnOpen: true } },
      { by: 'settings.json', value: { startOnOpen: false } },
    ]);
  });

  it('two schemas for one key — a complaint naming the first', () => {
    const { registry, complaints } = store();
    registry.declare('toolbar.button', 'core', BUTTON);
    registry.declare('toolbar.button', '@mosetta/ide-plugin-second', { type: 'string' });
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain('core');
    registry.add('toolbar.button', 'a string', '@mosetta/ide-plugin-second');
    expect(complaints).toHaveLength(2);
  });

  it('an entry is withdrawn by what add returned', () => {
    const { registry } = store();
    const off = registry.add('chrome.top', 'first', 'core');
    registry.add('chrome.top', 'second', 'core');
    off();
    expect(registry.all('chrome.top').value).toEqual(['second']);
    off();
    expect(registry.all('chrome.top').value).toEqual(['second']);
  });

  it('the view onto a key is one and the same', () => {
    const { registry } = store();
    expect(registry.all('chrome.top')).toBe(registry.all('chrome.top'));
  });

  it('the view is live: a subscriber sees what was added', () => {
    const { registry } = store();
    const view = registry.all<string>('chrome.top');
    expect(view.value).toEqual([]);
    registry.add('chrome.top', 'first', 'core');
    expect(view.value).toEqual(['first']);
  });

  it('it reports on itself: the keys, the schemas, the count', () => {
    const { registry } = store();
    registry.declare('toolbar.button', 'core', BUTTON);
    registry.add('toolbar.button', { id: 'tree', command: 'panel.tree' }, 'core');
    registry.add('chrome.top', 'a view', '@mosetta/ide-plugin-toolbar');
    expect(registry.describe()).toEqual([
      { key: 'chrome.top', count: 1 },
      { key: 'toolbar.button', schema: BUTTON, declaredBy: 'core', count: 1 },
    ]);
  });
});
