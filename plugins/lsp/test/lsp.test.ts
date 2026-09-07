import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@ide/api/testing';
import DocPlugin from '@ide/plugin-doc';
import LspPlugin, { type Diagnostic } from '../src/client.js';

const NAME = '@ide/plugin-lsp';
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
  host.add(DocPlugin, '@ide/plugin-doc');
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
