import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost, of, nodes } from '@mosetta/ide-api/testing';
import Toolbar from '../src/client.js';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import { settingsKey, USER_LAYER } from '@mosetta/ide-api/client';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * The toolbar is checked as a PLUGIN.
 *
 * Before it moved out, a core test guarded it, and one still does — but from the other
 * side: there it is checked that the CORE wrote a wish into the registry for each of
 * its panels. What a reader does with those wishes is invisible to that test, and that
 * is honest — there may be no reader at all.
 *
 * Here is the second half: the toolbar is brought up by a fake host, the wishes are
 * written by the test, and what is checked is what a human would see — which buttons,
 * in what order, and what happens on a click.
 */

const NAME = '@mosetta/ide-plugin-toolbar';

/**
 * A button as the core writes it. The icon is marked so as to be recognised in the
 * tree.
 */
function wish(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `toolbar.${id}`,
    command: `panel.${id}`,
    icon: (filled: boolean) => <i data-id={id} data-filled={String(filled)} />,
    ...extra,
  };
}

/** The icons in order — which is the order of the buttons as a human sees them. */
function order(tree: unknown): string[] {
  return nodes(tree)
    .map((node) => node.props['data-id'])
    .filter((id): id is string => typeof id === 'string');
}

describe('the toolbar', () => {
  let host: FakeHost;
  let top: () => unknown;

  beforeEach(async () => {
    host = new FakeHost();
    host.add(UiPlugin, '@mosetta/ide-plugin-ui');
    host.add(KeymapPlugin, '@mosetta/ide-plugin-keymap');
    host.add(Toolbar, NAME);
    await host.start();
    top = host.registry.all<() => unknown>('chrome.top')[host.registry.authors('chrome.top').indexOf(NAME)]!;
  });

  it('declares its keys before anyone has started writing', () => {
    const early = new FakeHost();
    early.add(Toolbar, NAME);
    expect(early.registry.declared()).toEqual(['toolbar.button', 'toolbar.widget']);
  });

  it('takes the place at the top and brings its own styles', () => {
    expect(typeof top).toBe('function');
    expect(host.ide(NAME).styles.join('')).toContain('.toolbar');
  });

  it('the order of the buttons is a list of commands from the settings', () => {
    host.setSettings({ toolbar: { order: ['panel.git', 'panel.tree'] } });
    host.registry.add('toolbar.button', wish('tree'), 'core');
    host.registry.add('toolbar.button', wish('git'), 'core');
    expect(order(top())).toEqual(['git', 'tree']);
  });

  it('whatever is not in the list goes to the end in order of appearance', () => {
    host.setSettings({ toolbar: { order: ['panel.tree'] } });
    host.registry.add('toolbar.button', wish('git'), 'core');
    host.registry.add('toolbar.button', wish('tree'), 'core');
    host.registry.add('toolbar.button', wish('keys'), 'core');
    expect(order(top())).toEqual(['tree', 'git', 'keys']);
  });

  it('without settings the order stays the one they arrived in', () => {
    host.registry.add('toolbar.button', wish('tree'), 'core');
    host.registry.add('toolbar.button', wish('git'), 'core');
    expect(order(top())).toEqual(['tree', 'git']);
  });

  it('a conditional button appears and disappears', () => {
    const visible = { value: false };
    host.registry.add('toolbar.button', wish('merge', { visible }), 'core');
    expect(order(top())).toEqual([]);
    visible.value = true;
    expect(order(top())).toEqual(['merge']);
  });

  it('an open panel is filled, a closed one outlined', () => {
    const active = { value: true };
    host.registry.add('toolbar.button', wish('tree', { active }), 'core');
    const filled = () => nodes(top()).find((n) => n.props['data-id'] === 'tree')!.props['data-filled'];
    expect(filled()).toBe('true');
    expect(of(top(), 'button')[0]!.props['class']).toContain('is-active');
    active.value = false;
    expect(filled()).toBe('false');
    expect(of(top(), 'button')[0]!.props['class']).not.toContain('is-active');
  });

  it('a click calls the command — exactly what a key does', () => {
    const called: string[] = [];
    host.ide(NAME).command('panel.tree', () => called.push('tree'));
    host.registry.add('toolbar.button', wish('tree'), 'core');
    const button = of(top(), 'button')[0]!;
    (button.props['onClick'] as () => void)();
    expect(called).toEqual(['tree']);
  });

  it('the tooltip takes its keys from the keymap rather than from the dictionary', () => {
    host.registry.add(
      settingsKey('keymap'),
      { version: 1, bindings: [{ command: 'panel.tree', key: 'meta+1' }] },
      USER_LAYER,
    );
    host.registry.add('toolbar.button', wish('tree'), 'core');
    const button = of(top(), 'button')[0]!;
    (button.props['onMouseEnter'] as (e: unknown) => void)({
      currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0 }) },
    });
    expect(host.plugin(UiPlugin).windows.tips.spot.value).toEqual({
      x: 0,
      y: 6,
      above: -6,
      title: 'toolbar.tree',
      keys: [host.plugin(KeymapPlugin).keys.humanize('meta+1')],
    });
    (button.props['onMouseLeave'] as () => void)();
    expect(host.plugin(UiPlugin).windows.tips.spot.value).toBeNull();
  });

  it('a number on the button is shown only when there is one', () => {
    host.registry.add('toolbar.button', wish('git', { badge: { value: 0 } }), 'core');
    expect(of(top(), 'span').filter((n) => n.props['class'] === 'tool-count')).toHaveLength(0);
    host.registry.add('toolbar.button', wish('push', { badge: { value: 3 } }), 'core');
    const counts = of(top(), 'span').filter((n) => n.props['class'] === 'tool-count');
    expect(counts).toHaveLength(1);
    expect(counts[0]!.props['children']).toBe(3);
  });

  it('the widgets stand on their own sides', () => {
    host.registry.add(
      'toolbar.widget',
      { id: 'terminals', side: 'left', view: () => <i data-id="terminals" /> },
      'core',
    );
    host.registry.add(
      'toolbar.widget',
      { id: 'link', side: 'right', view: () => <i data-id="link" /> },
      'core',
    );
    const left = of(top(), 'div').find((n) => n.props['class'] === 'toolbar-left');
    const right = of(top(), 'div').find((n) => n.props['class'] === 'toolbar-right');
    expect(order(left)).toEqual(['terminals']);
    expect(order(right)).toEqual(['link']);
  });

  it('an entry of the wrong shape is rejected along with its author\'s name', () => {
    host.registry.add('toolbar.button', { id: 'tree', title: 'toolbar.tree' }, '@mosetta/ide-plugin-someone');
    expect(host.complaints).toHaveLength(1);
    expect(host.complaints[0]).toContain('@mosetta/ide-plugin-someone');
    expect(host.complaints[0]).toContain('toolbar.button');
    expect(host.complaints[0]).toContain('command');
  });

  it('an extra field is a refusal too: the schema is closed', () => {
    host.registry.add('toolbar.button', { ...wish('tree'), side: 'left' }, 'core');
    expect(host.complaints.join('')).toContain('side');
  });
});
