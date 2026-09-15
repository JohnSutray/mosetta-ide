import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '@mosetta/ide-plugin-doc';
import LspPlugin, { type Diagnostic } from '../src/client.js';

const NAME = '@mosetta/ide-plugin-lsp';
const PROJECT = { id: 'p1', root: '/один', name: 'один' } as never;
const OTHER = { id: 'p2', root: '/два', name: 'два' } as never;

function problem(line: number, message: string): Diagnostic {
  return { range: { start: { line, character: 0 }, end: { line, character: 3 } }, severity: 'error', message };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let host: FakeHost;
let plugin: LspPlugin;
let known: Array<{ path: string; diagnostics: Diagnostic[] }>;

beforeEach(async () => {
  host = new FakeHost();
  (globalThis as Record<string, unknown>)['document'] ??= {};
  host.add(DocPlugin, '@mosetta/ide-plugin-doc');
  plugin = host.add(LspPlugin, NAME);
  known = [{ path: 'b.ts', diagnostics: [problem(1, 'сломано')] }];
  const ide = host.ide(NAME);
  ide.answers.set('status', () => [{ server: 'typescript', state: 'ready', openDocs: 0 }]);
  ide.answers.set('problems', () => known);
  ide.answers.set('diagnostics', (params) => ({ path: (params as { path: string }).path, diagnostics: [] }));
  await host.start();
});

describe('языковой сервер у плагина', () => {
  it('при прикреплении спрашивает статус и уже найденные ошибки', async () => {
    host.surface.workspaceCurrent.value = PROJECT;
    host.surface.project.value = PROJECT;
    await settle();
    expect(plugin.statuses.value.map((s) => s.state)).toEqual(['ready']);
    expect(plugin.problems.value.map((f) => f.path)).toEqual(['b.ts']);
  });

  it('событие дописывает карту, список — по алфавиту и без пустых', async () => {
    host.surface.workspaceCurrent.value = PROJECT;
    host.surface.project.value = PROJECT;
    await settle();
    host.ide(NAME).emit('diagnostics', { path: 'a.ts', diagnostics: [problem(3, 'тут')] });
    host.ide(NAME).emit('diagnostics', { path: 'c.ts', diagnostics: [] });
    expect(plugin.problems.value.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    host.ide(NAME).emit('diagnostics', { path: 'b.ts', diagnostics: [] });
    expect(plugin.problems.value.map((f) => f.path)).toEqual(['a.ts']);
  });

  it('открытый файл видит своё, и только своё', async () => {
    host.surface.workspaceCurrent.value = PROJECT;
    host.surface.project.value = PROJECT;
    await settle();
    expect(plugin.fileDiagnostics.value).toEqual([]);
    host.plugin(DocPlugin).doc.open.value = { path: 'b.ts', text: '', version: 1, revision: null, readOnly: false } as never;
    expect(plugin.fileDiagnostics.value.map((d) => d.message)).toEqual(['сломано']);
  });

  it('смена проекта обнуляет сказанное, разрыв сокета — нет', async () => {
    host.surface.workspaceCurrent.value = PROJECT;
    host.surface.project.value = PROJECT;
    await settle();
    expect(plugin.problems.value).toHaveLength(1);

    host.surface.project.value = null;
    expect(plugin.problems.value).toHaveLength(1);
    host.surface.project.value = PROJECT;
    await settle();

    known = [];
    host.surface.workspaceCurrent.value = OTHER;
    host.surface.project.value = OTHER;
    await settle();
    expect(plugin.problems.value).toHaveLength(0);
    expect(plugin.statuses.value.map((s) => s.state)).toEqual(['ready']);
  });
});

describe('индикатор обхода', () => {
  function widget(): { id: string; side: string; view: () => unknown } | undefined {
    return host.registry
      .all<{ id: string; side: string; view: () => unknown }>('toolbar.widget')
      .find((one) => one.id === 'lsp-sweep');
  }

  function say(sweep: Record<string, unknown> | null): void {
    plugin.lsp.statuses.value = [
      {
        server: 'typescript',
        state: 'ready',
        openDocs: 0,
        ...(sweep ? { sweep: sweep as never } : {}),
      },
    ];
  }

  it('просит место в тулбаре справа', () => {
    expect(widget()?.side).toBe('right');
  });

  it('обхода не было — молчит', () => {
    say(null);
    expect(widget()!.view()).toBeNull();
  });

  it('настройка выключает его целиком', () => {
    say({ checked: 10, total: 20, mb: 100, baseMb: 50, budgetMb: 3072, stopped: null });
    expect(widget()!.view()).not.toBeNull();
    host.ide(NAME).settings.value = { lsp: { sweepIndicator: false } } as never;
    expect(widget()!.view()).toBeNull();
  });

  it('щелчок ведёт к настройке бюджета, а не просто открывает настройки', () => {
    const asked: string[] = [];
    host.registry.add('settings.reveal', { id: 'settings', reveal: (q: string) => asked.push(q) }, '@mosetta/ide-plugin-settings');
    say({ checked: 10, total: 20, mb: 100, baseMb: 50, budgetMb: 3072, stopped: 'budget' });

    const tree = widget()!.view() as { props: { children: Array<{ props: { onClick: () => void } }> } };
    tree.props.children[0]!.props.onClick();
    expect(asked).toEqual(['memoryBudgetMb']);
  });

  function down(detail: string): void {
    plugin.lsp.statuses.value = [{ server: 'typescript', state: 'failed', detail, openDocs: 0 }];
  }

  it('сервер упал — плашка есть, хотя обхода не было', () => {
    down('typescript-language-server: spawn typescript-language-server ENOENT');
    expect(widget()!.view()).not.toBeNull();
  });

  it('щелчок по ней ведёт к строке с командой, а не к бюджету', () => {
    const asked: string[] = [];
    host.registry.add('settings.reveal', { id: 'settings', reveal: (q: string) => asked.push(q) }, '@mosetta/ide-plugin-settings');
    down('spawn ENOENT');
    const tree = widget()!.view() as { props: { children: Array<{ props: { onClick: () => void } }> } };
    tree.props.children[0]!.props.onClick();
    expect(asked).toEqual(['servers']);
  });

  it('сервер здоров и обхода не было — по-прежнему молчит', () => {
    plugin.lsp.statuses.value = [{ server: 'typescript', state: 'ready', openDocs: 0 }];
    expect(widget()!.view()).toBeNull();
  });

  it('настройка гасит и плашку про падение', () => {
    down('spawn ENOENT');
    host.ide(NAME).settings.value = { lsp: { sweepIndicator: false } } as never;
    expect(widget()!.view()).toBeNull();
  });

  it('без плагина настроек щелчок ничего не ломает', () => {
    say({ checked: 10, total: 20, mb: 100, baseMb: 50, budgetMb: 3072, stopped: 'budget' });
    const tree = widget()!.view() as { props: { children: Array<{ props: { onClick: () => void } }> } };
    expect(() => tree.props.children[0]!.props.onClick()).not.toThrow();
  });
});
