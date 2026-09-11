import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost, nodes, of } from '@mosetta/ide-api/testing';
import LspPlugin, { type Diagnostic, type FileDiagnostics } from '@mosetta/ide-plugin-lsp';
import DocPlugin from '@mosetta/ide-plugin-doc';
import Problems from '../src/client.js';

const NAME = '@mosetta/ide-plugin-problems';

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

  function setProblems(files: FileDiagnostics[]): void {
    host.plugin(LspPlugin).lsp.diagnostics.value = new Map(files.map((f) => [f.path, f.diagnostics]));
  }

  beforeEach(async () => {
    host = new FakeHost();
    (globalThis as Record<string, unknown>)['document'] ??= {};
    host.add(DocPlugin, '@mosetta/ide-plugin-doc');
    host.add(LspPlugin, '@mosetta/ide-plugin-lsp');
    host.add(Problems, NAME);
    host.surface.docs.texts.set('a.ts', '');
    await host.start();
    view = wish().view;
  });

  function wish() {
    return host.registry.all<{
      id: string;
      title: string;
      side: string;
      open: { value: boolean };
      view: () => unknown;
      close: () => void;
      defaultWidth?: number;
      minWidth?: number;
    }>('panel')[0]!;
  }

  it('заводит панель по правилам, общим для всех', () => {
    const spec = wish();
    expect(spec.id).toBe('problems');
    expect(spec.side).toBe('right');
    expect(spec.defaultWidth!).toBeGreaterThanOrEqual(spec.minWidth!);
    expect(spec.minWidth!).toBeGreaterThan(80);
    expect(spec.title).toBe('panel.problems');
  });

  it('команду-переключатель заводит плагин, а память ведёт ядро', () => {
    expect(host.ide(NAME).remembered.has('panel.open')).toBe(true);
    expect(wish().open.value).toBe(false);
    expect(host.run('panel.problems')).toBe(true);
    expect(wish().open.value).toBe(true);
  });

  it('просит кнопку отдельно от панели', () => {
    const wishes = host.registry.all<{ command: string; active: { value: boolean } }>(
      'toolbar.button',
    );
    expect(wishes).toHaveLength(1);
    expect(host.registry.authors('toolbar.button')).toEqual([NAME]);
    expect(wishes[0]!.command).toBe('panel.problems');
    expect(wishes[0]!.active).toBe(wish().open);
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
    setProblems([
      { path: 'a.ts', diagnostics: [problem(0, 'раз')] },
      { path: 'b.ts', diagnostics: [problem(1, 'два'), problem(2, 'три')] },
    ]);
    host.plugin(DocPlugin).doc.open.value = { path: 'a.ts' } as never;
    const paths = of(view(), 'span')
      .filter((n) => n.props['class'] === 'problems-path')
      .map((n) => n.props['children']);
    expect(paths).toEqual(['a.ts', 'b.ts']);
    expect(of(view(), 'li')).toHaveLength(3);
  });

  it('открытый файл помечен', () => {
    setProblems([
      { path: 'a.ts', diagnostics: [problem(0, 'раз')] },
      { path: 'b.ts', diagnostics: [problem(0, 'два')] },
    ]);
    host.plugin(DocPlugin).doc.open.value = { path: 'b.ts' } as never;
    const marked = of(view(), 'div')
      .filter((n) => String(n.props['class']).startsWith('problems-where'))
      .map((n) => String(n.props['class']).includes('is-current'));
    expect(marked).toEqual([false, true]);
  });

  it('нажатие ведёт в строку и колонку', async () => {
    setProblems([{ path: 'a.ts', diagnostics: [problem(7, 'вот тут')] }]);
    const row = of(view(), 'li')[0]!;
    await (row.props['onClick'] as () => Promise<void>)();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.plugin(DocPlugin).doc.pendingReveal.value).toMatchObject({ path: 'a.ts', line: 7, character: 4 });
  });

  it('нажатие на путь ведёт к первой ошибке файла', async () => {
    setProblems([
      { path: 'a.ts', diagnostics: [problem(3, 'первая'), problem(9, 'вторая')] },
    ]);
    const head = of(view(), 'div').find((n) =>
      String(n.props['class']).startsWith('problems-where'),
    )!;
    await (head.props['onClick'] as () => Promise<void>)();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.plugin(DocPlugin).doc.pendingReveal.value).toMatchObject({ path: 'a.ts', line: 3, character: 4 });
  });

  it('усечение ВИДНО строкой, а не молчит', () => {
    const many = Array.from({ length: 600 }, (_, i) => problem(i, `ошибка ${i}`));
    setProblems([{ path: 'a.ts', diagnostics: many }]);
    expect(of(view(), 'li')).toHaveLength(500);
    const more = of(view(), 'div').find((n) => n.props['class'] === 'problems-more')!;
    expect(more.props['children']).toBe('problems.more(count=100)');
  });

  it('пока всё влезло — про усечение ни слова', () => {
    setProblems([{ path: 'a.ts', diagnostics: [problem(0, 'одна')] }]);
    expect(of(view(), 'div').filter((n) => n.props['class'] === 'problems-more')).toHaveLength(0);
  });

  it('сорт проблемы виден классом строки', () => {
    setProblems([
      {
        path: 'a.ts',
        diagnostics: [problem(0, 'красная'), problem(1, 'жёлтая', { severity: 'warning' })],
      },
    ]);
    expect(of(view(), 'li').map((n) => n.props['class'])).toEqual([
      'problem is-error',
      'problem is-warning',
    ]);
  });
});
