import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost, nodes, of } from '@mosetta/ide-api/testing';
import UiPlugin, { Resizer } from '@mosetta/ide-plugin-ui';
import Layout from '../src/client.js';
import type { PanelWish } from '../src/schema.js';

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

describe('раскладка', () => {
  let host: FakeHost;
  let main: () => unknown;

  beforeEach(async () => {
    host = new FakeHost();
    host.add(UiPlugin, '@mosetta/ide-plugin-ui');
    host.add(Layout, NAME);
    await host.start();
    main = host.registry.all<() => unknown>('chrome.main')[0]!;
  });

  it('объявляет форму колонки до того, как кто-то начал писать', () => {
    const early = new FakeHost();
    early.add(Layout, NAME);
    expect(early.registry.declared()).toEqual(['panel', 'panel.action']);
  });

  it('занимает середину рамы и приносит свои стили', () => {
    expect(typeof main).toBe('function');
    expect(host.ide(NAME).styles.join('')).toContain('.columns');
  });

  it('навигация слева, рабочее справа, остаток посередине', () => {
    host.registry.add('panel', wish('tree', 'left'), 'core');
    host.registry.add('panel', wish('editor', 'main'), 'core');
    host.registry.add('panel', wish('terminal', 'right'), 'core');
    expect(shape(main())).toEqual(['tree', '|tree', 'editor', '|terminal', 'terminal']);
  });

  it('полоска стоит с той стороны, за которую тянут', () => {
    host.registry.add('panel', wish('tree', 'left'), 'core');
    host.registry.add('panel', wish('git', 'left'), 'core');
    host.registry.add('panel', wish('terminal', 'right'), 'core');
    host.registry.add('panel', wish('problems', 'right'), '@mosetta/ide-plugin-problems');
    expect(shape(main())).toEqual([
      'tree', '|tree', 'git', '|git',
      '|terminal', 'terminal', '|problems', 'problems',
    ]);
  });

  it('порядок внутри стороны — порядок пожеланий', () => {
    host.registry.add('panel', wish('terminal', 'right'), 'core');
    host.registry.add('panel', wish('problems', 'right'), '@mosetta/ide-plugin-problems');
    expect(shape(main()).filter((one) => !one.startsWith('|'))).toEqual([
      'terminal',
      'problems',
    ]);
  });

  it('закрытую колонку не рисуют вовсе', () => {
    const open = { value: false };
    host.registry.add('panel', wish('tree', 'left', { open }), 'core');
    expect(shape(main())).toEqual([]);
    open.value = true;
    expect(shape(main())).toEqual(['tree', '|tree']);
  });

  it('у середины ширины нет: она забирает остаток', () => {
    host.registry.add('panel', wish('editor', 'main'), 'core');
    const column = of(main(), 'section')[0]!;
    expect(column.props['style']).toBeUndefined();
    expect(String(column.props['class'])).toContain('is-main');
  });

  it('ширина берётся из памяти, а без памяти — из пожелания', () => {
    host.registry.add('panel', wish('tree', 'left', { defaultWidth: 260 }), 'core');
    const width = () =>
      (of(main(), 'section')[0]!.props['style'] as { width: string }).width;
    expect(width()).toBe('260px');
    host.plugin(UiPlugin).windows.geometry.setWidth('tree', 410, { min: 0, max: 4000 });
    expect(width()).toBe('410px');
  });

  it('колонка не съедает экран целиком', () => {
    host.registry.add('panel', wish('tree', 'left', { minWidth: 150 }), 'core');
    const grip = nodes(main()).find((node) => node.type === Resizer)!;
    const limits = (grip.props['limits'] as () => { min: number; max: number })();
    expect(limits.min).toBe(150);
    expect(limits.max).toBeLessThan(1200);
    expect(limits.max).toBeGreaterThan(150);
  });

  it('три правые колонки не съедают середину: показ ужат, память цела', () => {
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

  it('сосед ставит действие в заголовок чужой панели', () => {
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

  it('действие без права работать погашено, а не спрятано', () => {
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

  it('заголовок постоянный — ключ словаря, непостоянный — своя строка', () => {
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

  it('нечего сказать заголовком — показываем имя панели', () => {
    host.registry.add('panel', wish('editor', 'main', { heading: () => null }), 'core');
    const title = of(main(), 'span').find((node) => node.props['class'] === 'panel-title')!;
    expect(title.props['children']).toBe('panel.editor');
  });

  it('крестик есть только у того, кто умеет закрываться', () => {
    let closed = 0;
    host.registry.add('panel', wish('tree', 'left', { close: () => closed++ }), 'core');
    host.registry.add('panel', wish('editor', 'main'), 'core');
    const crosses = of(main(), 'span').filter((node) => node.props['class'] === 'panel-close');
    expect(crosses).toHaveLength(1);
    (crosses[0]!.props['onClick'] as () => void)();
    expect(closed).toBe(1);
  });

  it('метки панели живут в её заголовке', () => {
    host.registry.add(
      'panel',
      wish('editor', 'main', { badges: () => <span class="tag">read-only</span> }),
      'core',
    );
    const head = of(main(), 'header')[0]!;
    const tags = nodes(head).filter((node) => node.props['class'] === 'tag');
    expect(tags).toHaveLength(1);
  });

  it('содержимое зовётся функцией: раскладка не знает, что внутри', () => {
    host.registry.add('panel', wish('tree', 'left'), 'core');
    const body = of(main(), 'div').find((node) => node.props['class'] === 'panel-body')!;
    expect(nodes(body).some((node) => node.props['data-id'] === 'tree')).toBe(true);
  });

  it('пожелание не той формы отвергается вместе с именем автора', () => {
    host.registry.add('panel', { id: 'x', title: 'panel.x', side: 'left' }, '@mosetta/ide-plugin-чей-то');
    expect(host.complaints).toHaveLength(1);
    expect(host.complaints[0]).toContain('@mosetta/ide-plugin-чей-то');
    expect(host.complaints[0]).toContain('«open»');
  });

  it('сторона выдумана — тоже отказ', () => {
    host.registry.add('panel', { ...wish('x', 'left'), side: 'top' as never }, 'core');
    expect(host.complaints.join('')).toContain('/side');
  });
});
