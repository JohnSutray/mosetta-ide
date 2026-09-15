import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost, of, nodes } from '@mosetta/ide-api/testing';
import Toolbar from '../src/client.js';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import { settingsKey, USER_LAYER } from '@mosetta/ide-api/client';
import UiPlugin from '@mosetta/ide-plugin-ui';

const NAME = '@mosetta/ide-plugin-toolbar';

function wish(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `toolbar.${id}`,
    command: `panel.${id}`,
    icon: (filled: boolean) => <i data-id={id} data-filled={String(filled)} />,
    ...extra,
  };
}

function order(tree: unknown): string[] {
  return nodes(tree)
    .map((node) => node.props['data-id'])
    .filter((id): id is string => typeof id === 'string');
}

describe('тулбар', () => {
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

  it('объявляет свои ключи до того, как кто-то начал писать', () => {
    const early = new FakeHost();
    early.add(Toolbar, NAME);
    expect(early.registry.declared()).toEqual(['toolbar.button', 'toolbar.widget']);
  });

  it('занимает место наверху и приносит свои стили', () => {
    expect(typeof top).toBe('function');
    expect(host.ide(NAME).styles.join('')).toContain('.toolbar');
  });

  it('порядок кнопок — список команд из настроек', () => {
    host.setSettings({ toolbar: { order: ['panel.git', 'panel.tree'] } });
    host.registry.add('toolbar.button', wish('tree'), 'core');
    host.registry.add('toolbar.button', wish('git'), 'core');
    expect(order(top())).toEqual(['git', 'tree']);
  });

  it('чего в списке нет — встаёт в конец в порядке появления', () => {
    host.setSettings({ toolbar: { order: ['panel.tree'] } });
    host.registry.add('toolbar.button', wish('git'), 'core');
    host.registry.add('toolbar.button', wish('tree'), 'core');
    host.registry.add('toolbar.button', wish('keys'), 'core');
    expect(order(top())).toEqual(['tree', 'git', 'keys']);
  });

  it('без настроек порядок остаётся тем, в котором пришли', () => {
    host.registry.add('toolbar.button', wish('tree'), 'core');
    host.registry.add('toolbar.button', wish('git'), 'core');
    expect(order(top())).toEqual(['tree', 'git']);
  });

  it('условная кнопка появляется и исчезает', () => {
    const visible = { value: false };
    host.registry.add('toolbar.button', wish('merge', { visible }), 'core');
    expect(order(top())).toEqual([]);
    visible.value = true;
    expect(order(top())).toEqual(['merge']);
  });

  it('открытая панель залита, закрытая контуром', () => {
    const active = { value: true };
    host.registry.add('toolbar.button', wish('tree', { active }), 'core');
    const filled = () => nodes(top()).find((n) => n.props['data-id'] === 'tree')!.props['data-filled'];
    expect(filled()).toBe('true');
    expect(of(top(), 'button')[0]!.props['class']).toContain('is-active');
    active.value = false;
    expect(filled()).toBe('false');
    expect(of(top(), 'button')[0]!.props['class']).not.toContain('is-active');
  });

  it('нажатие зовёт команду — ровно то же, что делает клавиша', () => {
    const called: string[] = [];
    host.ide(NAME).command('panel.tree', () => called.push('tree'));
    host.registry.add('toolbar.button', wish('tree'), 'core');
    const button = of(top(), 'button')[0]!;
    (button.props['onClick'] as () => void)();
    expect(called).toEqual(['tree']);
  });

  it('подсказка берёт клавиши из раскладки, а не из словаря', () => {
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

  it('число на кнопке показывается только когда оно есть', () => {
    host.registry.add('toolbar.button', wish('git', { badge: { value: 0 } }), 'core');
    expect(of(top(), 'span').filter((n) => n.props['class'] === 'tool-count')).toHaveLength(0);
    host.registry.add('toolbar.button', wish('push', { badge: { value: 3 } }), 'core');
    const counts = of(top(), 'span').filter((n) => n.props['class'] === 'tool-count');
    expect(counts).toHaveLength(1);
    expect(counts[0]!.props['children']).toBe(3);
  });

  it('виджеты стоят по своим сторонам', () => {
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

  it('запись не той формы отвергается вместе с именем автора', () => {
    host.registry.add('toolbar.button', { id: 'tree', title: 'toolbar.tree' }, '@mosetta/ide-plugin-чей-то');
    expect(host.complaints).toHaveLength(1);
    expect(host.complaints[0]).toContain('@mosetta/ide-plugin-чей-то');
    expect(host.complaints[0]).toContain('toolbar.button');
    expect(host.complaints[0]).toContain('command');
  });

  it('лишнее поле — тоже отказ: схема закрытая', () => {
    host.registry.add('toolbar.button', { ...wish('tree'), side: 'left' }, 'core');
    expect(host.complaints.join('')).toContain('side');
  });
});

describe('плашка демона', () => {
  let host: FakeHost;

  beforeEach(async () => {
    host = new FakeHost();
    host.add(UiPlugin, '@mosetta/ide-plugin-ui');
    host.add(KeymapPlugin, '@mosetta/ide-plugin-keymap');
    host.add(Toolbar, NAME);
    await host.start();
  });

  function widget(): { id: string; side: string; view: () => unknown } | undefined {
    return host.registry
      .all<{ id: string; side: string; view: () => unknown }>('toolbar.widget')
      .find((one) => one.id === 'daemon');
  }

  function said(): string[] {
    return nodes(widget()!.view())
      .flatMap((node) => [node.props['children']].flat())
      .map((one) => String(one));
  }

  it('пульса ещё не было — молчит', () => {
    expect(widget()!.view()).toBeNull();
  });

  it('показывает СВОЙ размер, а дерево уносит в подсказку', () => {
    host.surface.daemon.value = { rssMb: 412, treeMb: 2458 };
    expect(said()).toContain('toolbar.daemon.size(rss=412)');
  });

  it('система не мерится — подсказка не выдумывает дерево', () => {
    host.surface.daemon.value = { rssMb: 412, treeMb: null };
    const tip = nodes(widget()!.view()).map((n) => n.props['onMouseEnter']).find(Boolean);
    expect(typeof tip).toBe('function');
    expect(said()).toContain('toolbar.daemon.size(rss=412)');
  });

  it('настройка выключает плашку целиком', () => {
    host.surface.daemon.value = { rssMb: 412, treeMb: 2458 };
    expect(widget()!.view()).not.toBeNull();
    host.ide(NAME).settings.value = { toolbar: { daemonMemory: false } } as never;
    expect(widget()!.view()).toBeNull();
  });

  it('щелчок ведёт к своему выключателю', () => {
    const asked: string[] = [];
    host.registry.add('settings.reveal', { id: 'settings', reveal: (q: string) => asked.push(q) }, '@mosetta/ide-plugin-settings');
    host.surface.daemon.value = { rssMb: 412, treeMb: 2458 };

    const tree = widget()!.view() as { props: { onClick: () => void } };
    tree.props.onClick();
    expect(asked).toEqual(['daemonMemory']);
  });
});
