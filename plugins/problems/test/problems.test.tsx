import { beforeEach, describe, expect, it } from 'vitest';
import type { Diagnostic } from '@ide/protocol';
import { FakeHost, nodes, of } from '@ide/api/testing';
import Problems from '../src/client.js';

const NAME = '@ide/plugin-problems';

function problem(line: number, message: string, extra: Partial<Diagnostic> = {}): Diagnostic {
  return {
    range: { start: { line, character: 4 }, end: { line, character: 9 } },
    severity: 'error',
    message,
    ...extra,
  };
}

describe('панель ошибок', () => {
  let host: FakeHost;
  let view: () => unknown;

  beforeEach(async () => {
    host = new FakeHost();
    host.add(Problems, NAME);
    await host.start();
    view = host.ide(NAME).panels[0]!.spec.view;
  });

  it('заводит панель по правилам, общим для всех', () => {
    const spec = host.ide(NAME).panels[0]!.spec;
    expect(spec.id).toBe('problems');
    expect(spec.side).toBe('right');
    expect(spec.defaultWidth!).toBeGreaterThanOrEqual(spec.minWidth!);
    expect(spec.minWidth!).toBeGreaterThan(80);
    expect(spec.title).toBe('panel.problems');
  });

  it('команду-переключатель заводит система, а не плагин', () => {
    const panel = host.ide(NAME).panels[0]!;
    expect(panel.open.value).toBe(false);
    expect(host.run('panel.problems')).toBe(true);
    expect(panel.open.value).toBe(true);
  });

  it('просит кнопку отдельно от панели', () => {
    const wishes = host.registry.all<{ command: string; active: { value: boolean } }>(
      'toolbar.button',
    );
    expect(wishes).toHaveLength(1);
    expect(host.registry.authors('toolbar.button')).toEqual([NAME]);
    expect(wishes[0]!.command).toBe('panel.problems');
    expect(wishes[0]!.active).toBe(host.ide(NAME).panels[0]!.open);
  });

  it('приносит свой значок и свои стили', () => {
    const wish = host.registry.all<{ icon: unknown }>('toolbar.button')[0]!;
    expect(typeof wish.icon).toBe('function');
    expect(host.ide(NAME).styles.join('')).toContain('.problems');
  });

  it('пусто — так и говорит', () => {
    expect(nodes(view()).map((n) => n.props['children'])).toContain('problems.empty');
  });

  it('показывает файлы целиком, а не только открытый', () => {
    host.surface.problems.value = [
      { path: 'a.ts', diagnostics: [problem(0, 'раз')] },
      { path: 'b.ts', diagnostics: [problem(1, 'два'), problem(2, 'три')] },
    ];
    host.surface.openPath.value = 'a.ts';
    const paths = of(view(), 'span')
      .filter((n) => n.props['class'] === 'problems-path')
      .map((n) => n.props['children']);
    expect(paths).toEqual(['a.ts', 'b.ts']);
    expect(of(view(), 'li')).toHaveLength(3);
  });

  it('открытый файл помечен', () => {
    host.surface.problems.value = [
      { path: 'a.ts', diagnostics: [problem(0, 'раз')] },
      { path: 'b.ts', diagnostics: [problem(0, 'два')] },
    ];
    host.surface.openPath.value = 'b.ts';
    const marked = of(view(), 'div')
      .filter((n) => String(n.props['class']).startsWith('problems-where'))
      .map((n) => String(n.props['class']).includes('is-current'));
    expect(marked).toEqual([false, true]);
  });

  it('нажатие ведёт в строку и колонку', async () => {
    host.surface.problems.value = [{ path: 'a.ts', diagnostics: [problem(7, 'вот тут')] }];
    const row = of(view(), 'li')[0]!;
    await (row.props['onClick'] as () => Promise<void>)();
    expect(host.surface.jumps).toEqual([{ path: 'a.ts', line: 7, character: 4 }]);
  });

  it('нажатие на путь ведёт к первой ошибке файла', async () => {
    host.surface.problems.value = [
      { path: 'a.ts', diagnostics: [problem(3, 'первая'), problem(9, 'вторая')] },
    ];
    const head = of(view(), 'div').find((n) =>
      String(n.props['class']).startsWith('problems-where'),
    )!;
    await (head.props['onClick'] as () => Promise<void>)();
    expect(host.surface.jumps).toEqual([{ path: 'a.ts', line: 3, character: 4 }]);
  });

  it('усечение ВИДНО строкой, а не молчит', () => {
    const many = Array.from({ length: 600 }, (_, i) => problem(i, `ошибка ${i}`));
    host.surface.problems.value = [{ path: 'a.ts', diagnostics: many }];
    expect(of(view(), 'li')).toHaveLength(500);
    const more = of(view(), 'div').find((n) => n.props['class'] === 'problems-more')!;
    expect(more.props['children']).toBe('problems.more(count=100)');
  });

  it('пока всё влезло — про усечение ни слова', () => {
    host.surface.problems.value = [{ path: 'a.ts', diagnostics: [problem(0, 'одна')] }];
    expect(of(view(), 'div').filter((n) => n.props['class'] === 'problems-more')).toHaveLength(0);
  });

  it('сорт проблемы виден классом строки', () => {
    host.surface.problems.value = [
      {
        path: 'a.ts',
        diagnostics: [problem(0, 'красная'), problem(1, 'жёлтая', { severity: 'warning' })],
      },
    ];
    expect(of(view(), 'li').map((n) => n.props['class'])).toEqual([
      'problem is-error',
      'problem is-warning',
    ]);
  });
});
