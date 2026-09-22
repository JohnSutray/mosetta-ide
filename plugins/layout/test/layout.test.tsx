import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost, nodes, of } from '@mosetta/ide-api/testing';
import UiPlugin, { Resizer } from '@mosetta/ide-plugin-ui';
import Layout from '../src/client.js';
import { Overlay } from '../src/overlay.js';
import type { PanelWish } from '../src/schema.js';

/**
 * The panel layout.
 *
 * Checked here: an interface of columns, navigation on the left, working panels on the
 * right, the editor in the middle taking the remainder. This used to rest on markup in
 * the core's frame and was checked by nothing but the eye.
 */

const NAME = '@mosetta/ide-plugin-layout';

(globalThis as { window?: object }).window = { innerWidth: 1200, innerHeight: 800, addEventListener: () => {} };

function wish(id: string, side: PanelWish['side'], extra: Partial<PanelWish> = {}): PanelWish {
  return {
    id,
    title: `panel.${id}`,
    side,
    open: { value: true },
    view: () => <i data-id={id} />,
    ...extra,
  };
}

/**
 * The columns and the strips between them, in the order the eye sees them.
 *
 * The resizer is recognised BY FUNCTION IDENTITY rather than by node name: the plugin
 * takes it from `@mosetta/ide-api/client` and the test from `@mosetta/ide-api/testing`,
 * and it is one and the same object, because the substitution leads to one file. As a
 * bonus, this checks that the plugin uses the shared resizer rather than one of its
 * own.
 */
function shape(tree: unknown): string[] {
  return nodes(tree)
    .map((node) => {
      if (node.type === Resizer) return `|${String(node.props['id'])}`;
      const cls = String(node.props['class'] ?? '');
      const found = /column-([\w.-]+)/.exec(cls);
      return found ? found[1]! : null;
    })
    .filter((one): one is string => one !== null);
}

describe('the layout', () => {
  let host: FakeHost;
  let main: () => unknown;

  beforeEach(async () => {
    host = new FakeHost();
    host.add(UiPlugin, '@mosetta/ide-plugin-ui');
    host.add(Layout, NAME);
    await host.start();
    main = host.registry.all<() => unknown>('chrome.main')[0]!;
  });

  it('declares the shape of a column before anyone has started writing', () => {
    const early = new FakeHost();
    early.add(Layout, NAME);
    expect(early.registry.declared()).toEqual(['main.overlay', 'panel', 'panel.action']);
  });

  it('takes the frame\'s middle and brings its own styles', () => {
    expect(typeof main).toBe('function');
    expect(host.ide(NAME).styles.join('')).toContain('.columns');
  });

  it('navigation on the left, working panels on the right, the remainder in the middle', () => {
    host.registry.add('panel', wish('tree', 'left'), 'core');
    host.registry.add('panel', wish('editor', 'main'), 'core');
    host.registry.add('panel', wish('terminal', 'right'), 'core');
    expect(shape(main())).toEqual(['tree', '|tree', 'editor', '|terminal', 'terminal']);
  });

  it('the strip stands on the side one drags from', () => {
    host.registry.add('panel', wish('tree', 'left'), 'core');
    host.registry.add('panel', wish('git', 'left'), 'core');
    host.registry.add('panel', wish('terminal', 'right'), 'core');
    host.registry.add('panel', wish('problems', 'right'), '@mosetta/ide-plugin-problems');
    expect(shape(main())).toEqual([
      'tree', '|tree', 'git', '|git',
      '|terminal', 'terminal', '|problems', 'problems',
    ]);
  });

  it('the order within a side is the order of the wishes', () => {
    host.registry.add('panel', wish('terminal', 'right'), 'core');
    host.registry.add('panel', wish('problems', 'right'), '@mosetta/ide-plugin-problems');
    expect(shape(main()).filter((one) => !one.startsWith('|'))).toEqual([
      'terminal',
      'problems',
    ]);
  });

  it('a closed column is not drawn at all', () => {
    const open = { value: false };
    host.registry.add('panel', wish('tree', 'left', { open }), 'core');
    expect(shape(main())).toEqual([]);
    open.value = true;
    expect(shape(main())).toEqual(['tree', '|tree']);
  });

  it('the middle has no width: it takes the remainder', () => {
    host.registry.add('panel', wish('editor', 'main'), 'core');
    const column = of(main(), 'section')[0]!;
    expect(column.props['style']).toBeUndefined();
    expect(String(column.props['class'])).toContain('is-main');
  });

  it('the width comes from memory, and without memory from the wish', () => {
    host.registry.add('panel', wish('tree', 'left', { defaultWidth: 260 }), 'core');
    const width = () =>
      (of(main(), 'section')[0]!.props['style'] as { width: string }).width;
    expect(width()).toBe('260px');
    host.plugin(UiPlugin).windows.geometry.setWidth('tree', 410, { min: 0, max: 4000 });
    expect(width()).toBe('410px');
  });

  it('a column does not eat the whole screen', () => {
    host.registry.add('panel', wish('tree', 'left', { minWidth: 150 }), 'core');
    const grip = nodes(main()).find((node) => node.type === Resizer)!;
    const limits = (grip.props['limits'] as () => { min: number; max: number })();
    expect(limits.min).toBe(150);
    expect(limits.max).toBeLessThan(1200);
    expect(limits.max).toBeGreaterThan(150);
  });

  it('three right columns do not eat the middle: the display is squeezed, the memory is whole', () => {
    host.registry.add('panel', wish('editor', 'main'), 'core');
    host.registry.add('panel', wish('terminal', 'right', { defaultWidth: 460, minWidth: 240 }), 'core');
    host.registry.add('panel', wish('debug', 'right', { defaultWidth: 340, minWidth: 240 }), 'core');
    host.registry.add('panel', wish('problems', 'right', { defaultWidth: 360, minWidth: 200 }), 'core');
    const widths = () => of(main(), 'section')
      .filter((node) => !String(node.props['class']).includes('is-main'))
      .map((node) => parseInt((node.props['style'] as { width: string }).width, 10));
    const shown = widths();
    expect(shown.reduce((a, b) => a + b, 0)).toBe(1280 - 320 - 3);
    expect(shown[0]).toBeLessThan(460);
    expect(host.plugin(UiPlugin).windows.geometry.widthOf('terminal', 460)).toBe(460);
    const grip = nodes(main()).find((node) => node.type === Resizer && node.props['id'] === 'terminal')!;
    const limits = (grip.props['limits'] as () => { min: number; max: number })();
    expect(limits.max).toBe(1280 - 320 - 3 - 240 - 200);
    expect((grip.props['width'] as () => number)()).toBe(shown[0]);
    const debugGrip = nodes(main()).find((node) => node.type === Resizer && node.props['id'] === 'debug')!;
    (debugGrip.props['onGrab'] as () => void)();
    host.plugin(UiPlugin).windows.geometry.setWidth('debug', 330, { min: 240, max: 4000 });
    const after = widths();
    expect(after[1]).toBe(330);
    expect(after[0]).toBeLessThan(shown[0]!);
    expect(after.reduce((a, b) => a + b, 0)).toBe(1280 - 320 - 3);
  });

  it('an overlay covers the MIDDLE and closes by its own cross', () => {
    host.registry.add('panel', wish('editor', 'main'), 'core');
    const open = { value: false };
    let closed = 0;
    host.registry.add(
      'main.overlay',
      {
        id: 'changes.diff',
        title: 'changes.diffTitle',
        open,
        keys: 'diff',
        view: () => <i data-id="diff" />,
        close: () => { closed += 1; },
      },
      '@mosetta/ide-plugin-changes',
    );

    const overlay = () => of(main(), 'section').find((node) => String(node.props['class']).includes('is-overlay'));
    expect(overlay(), 'a closed overlay is not drawn at all').toBeUndefined();

    open.value = true;
    const shown = nodes(main()).find((node) => node.type === Overlay);
    expect(shown, 'the frame is drawn by the layout rather than by the neighbour').toBeDefined();
    expect((shown!.props['overlay'] as { keys: string }).keys).toBe('diff');
    expect(shape(main())).toContain('editor');

    (shown!.props['overlay'] as { close: () => void }).close();
    expect(closed).toBe(1);
  });

  it('a neighbour puts an action into another panel\'s header', () => {
    host.registry.add('panel', wish('editor', 'main'), 'core');
    let ran = 0;
    host.registry.add(
      'panel.action',
      {
        id: 'debug.runFile',
        panel: 'editor',
        title: 'debug.title.run',
        icon: () => <i data-id="play" />,
        run: () => ran++,
      },
      '@mosetta/ide-plugin-debug',
    );
    host.registry.add('panel', wish('tree', 'left'), 'core');
    const buttons = of(main(), 'button').filter((node) => String(node.props['class']).includes('panel-action'));
    expect(buttons).toHaveLength(1);
    (buttons[0]!.props['onClick'] as () => void)();
    expect(ran).toBe(1);
  });

  it('an action with no right to work is disabled rather than hidden', () => {
    host.registry.add('panel', wish('editor', 'main'), 'core');
    host.registry.add(
      'panel.action',
      {
        id: 'debug.file',
        panel: 'editor',
        title: 'debug.title.debug',
        icon: () => <i />,
        enabled: () => false,
        run: () => undefined,
      },
      '@mosetta/ide-plugin-debug',
    );
    const button = of(main(), 'button').find((node) => String(node.props['class']).includes('panel-action'))!;
    expect(button.props['disabled']).toBe(true);
  });

  it('a permanent title is a dictionary key, an impermanent one is a string of its own', () => {
    host.registry.add('panel', wish('tree', 'left'), 'core');
    host.registry.add(
      'panel',
      wish('editor', 'main', { title: 'panel.editor.empty', heading: () => 'src/app.tsx' }),
      'core',
    );
    const titles = of(main(), 'span')
      .filter((node) => node.props['class'] === 'panel-title')
      .map((node) => node.props['children']);
    expect(titles).toEqual(['panel.tree', 'src/app.tsx']);
  });

  it('nothing to say as a title — we show the panel\'s name', () => {
    host.registry.add('panel', wish('editor', 'main', { heading: () => null }), 'core');
    const title = of(main(), 'span').find((node) => node.props['class'] === 'panel-title')!;
    expect(title.props['children']).toBe('panel.editor');
  });

  it('only whoever can close has a cross', () => {
    let closed = 0;
    host.registry.add('panel', wish('tree', 'left', { close: () => closed++ }), 'core');
    host.registry.add('panel', wish('editor', 'main'), 'core');
    const crosses = of(main(), 'span').filter((node) => node.props['class'] === 'panel-close');
    expect(crosses).toHaveLength(1);
    (crosses[0]!.props['onClick'] as () => void)();
    expect(closed).toBe(1);
  });

  it('a panel\'s marks live in its header', () => {
    host.registry.add(
      'panel',
      wish('editor', 'main', { badges: () => <span class="tag">read-only</span> }),
      'core',
    );
    const head = of(main(), 'header')[0]!;
    const tags = nodes(head).filter((node) => node.props['class'] === 'tag');
    expect(tags).toHaveLength(1);
  });

  it('the contents are called as a function: the layout does not know what is inside', () => {
    host.registry.add('panel', wish('tree', 'left'), 'core');
    const body = of(main(), 'div').find((node) => node.props['class'] === 'panel-body')!;
    expect(nodes(body).some((node) => node.props['data-id'] === 'tree')).toBe(true);
  });

  it('a wish of the wrong shape is rejected along with its author\'s name', () => {
    host.registry.add('panel', { id: 'x', title: 'panel.x', side: 'left' }, '@mosetta/ide-plugin-someone');
    expect(host.complaints).toHaveLength(1);
    expect(host.complaints[0]).toContain('@mosetta/ide-plugin-someone');
    expect(host.complaints[0]).toContain('«open»');
  });

  it('an invented side is a refusal too', () => {
    host.registry.add('panel', { ...wish('x', 'left'), side: 'top' as never }, 'core');
    expect(host.complaints.join('')).toContain('/side');
  });
});
