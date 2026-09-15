import { signal } from '@preact/signals';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '@mosetta/ide-plugin-doc';
import DebugPlugin, { expressionAt } from '../src/client.js';
import type { Frame, RunInfo } from '../src/types.js';

const NAME = '@mosetta/ide-plugin-debug';

function frame(source: Frame['source'], line = 4): Frame {
  return { id: 1, name: 'add', source, line, column: 3, faint: false };
}

const RUN: RunInfo = {
  id: '1',
  name: 'plain.js',
  state: 'running',
  sessions: [{ id: '1.0', name: 'plain.js', parent: null, kind: 'node', state: 'running' }],
};

describe('отладчик на вкладке', () => {
  let host: FakeHost;
  let debug: DebugPlugin;

  beforeEach(async () => {
    host = new FakeHost();
    (globalThis as Record<string, unknown>)['document'] ??= {};
    host.add(DocPlugin, '@mosetta/ide-plugin-doc');
    debug = host.add(DebugPlugin, NAME);
    host.surface.docs.texts.set('plain.js', 'function add() {}\n');
    const ide = host.ide(NAME);
    ide.answers.set('runs', () => []);
    ide.answers.set('breakpoints', () => []);
    ide.answers.set('stack', () => [frame({ kind: 'project', path: 'plain.js' })]);
    ide.answers.set('scopes', () => [{ name: 'Local', ref: 7, expensive: false }]);
    ide.answers.set('variables', () => [{ name: 'sum', value: '0', ref: 0 }]);
    ide.answers.set('exceptions', () => 'none');
    ide.answers.set('setExceptions', (params) => (params as { mode: string }).mode);
    ide.answers.set('setBreakpoints', (params) => {
      const asked = params as { path: string; breakpoints: Array<{ line: number }> };
      return { path: asked.path, breakpoints: asked.breakpoints.map((one) => ({ ...one, verified: false })) };
    });
    await host.start();
  });

  const wish = () =>
    host.registry.all<{ id: string; side: string; open: { value: boolean }; defaultWidth: number; minWidth: number }>('panel')[0]!;

  it('заводит панель справа, кнопку и команду-переключатель по общим правилам', () => {
    const panel = wish();
    expect(panel.id).toBe('debug');
    expect(panel.side).toBe('right');
    expect(panel.defaultWidth).toBeGreaterThanOrEqual(panel.minWidth);
    expect(panel.open.value).toBe(false);
    expect(host.run('panel.debug')).toBe(true);
    expect(panel.open.value).toBe(true);
    const button = host.registry.all<{ command: string; active: unknown }>('toolbar.button')[0]!;
    expect(button.command).toBe('panel.debug');
    expect(button.active).toBe(panel.open);
  });

  it('входит в редактор расширением, в окно скриптов — действием, в наведение — ответом', () => {
    expect(host.registry.authors('editor.extension')).toEqual([NAME]);
    expect(host.registry.all<{ id: string }>('scripts.action')[0]?.id).toBe('debug');
    expect(host.registry.all<{ id: string }>('editor.hover')[0]?.id).toBe('debug');
    const view = host.registry.all<{ opens: (path: string) => boolean; text: boolean }>('file.view')[0]!;
    expect(view.opens('debug:<node_internals>/internal/modules/cjs/loader')).toBe(true);
    expect(view.opens('src/app.ts')).toBe(false);
    expect(view.text).toBe(false);
  });

  it('«остановились» — читает стек, открывает файл и встаёт на строку', async () => {
    host.ide(NAME).emit('runs', [RUN]);
    host.ide(NAME).emit('stopped', { run: '1', session: '1.0', stop: { thread: 0, reason: 'breakpoint' } });
    const docs = host.plugin(DocPlugin);
    await until(() => docs.pendingReveal.value !== null);
    expect(host.surface.docs.opened).toEqual(['plain.js']);
    expect(docs.pendingReveal.value).toMatchObject({ path: 'plain.js', line: 3, character: 2 });
    expect(wish().open.value).toBe(true);
    await until(() => debug.state.scopes.value[0]?.children !== null);
    expect(debug.state.scopes.value[0]?.children?.[0]).toMatchObject({ name: 'sum', value: '0' });
  });

  it('кадр за корнем открывается своим показом под именем debug:', async () => {
    host.ide(NAME).answers.set('stack', () => [frame({ kind: 'adapter', name: '<node_internals>/x', reference: 5 }, 12)]);
    host.ide(NAME).emit('runs', [RUN]);
    host.ide(NAME).emit('stopped', { run: '1', session: '1.0', stop: { thread: 0, reason: 'step' } });
    const docs = host.plugin(DocPlugin);
    await until(() => docs.viewedFile.value !== null);
    expect(docs.viewedFile.value).toBe('debug:<node_internals>/x');
    expect(debug.state.foreign.get('debug:<node_internals>/x')).toMatchObject({ run: '1', session: '1.0', line: 12 });
  });

  it('запуск кончился — стек и остановка гаснут', async () => {
    host.ide(NAME).emit('runs', [RUN]);
    host.ide(NAME).emit('stopped', { run: '1', session: '1.0', stop: { thread: 0, reason: 'breakpoint' } });
    await until(() => debug.state.frames.value.length > 0);
    host.ide(NAME).emit('runs', [{ ...RUN, state: 'ended' }]);
    expect(debug.state.paused.value).toBeNull();
    expect(debug.state.frames.value).toEqual([]);
  });

  it('прикрепились к проекту — спрашивает запуски и точки; пустому серверу возвращает свои', async () => {
    const ide = host.ide(NAME);
    host.surface.workspaceCurrent.value = { id: 'w', root: '/p', name: 'p' } as never;
    ide.remembered.set('breakpoints:/p', signal({ 'plain.js': [{ line: 4 }] }));
    host.surface.project.value = { id: 'w', root: '/p', name: 'p' } as never;
    await until(() => ide.calls.some((call) => call.method === 'setBreakpoints'));
    expect(ide.calls.map((call) => call.method)).toEqual(expect.arrayContaining(['runs', 'breakpoints', 'setBreakpoints']));
    expect(debug.state.linesOf('plain.js')).toEqual([4]);
  });

  it('вывод: шум про карты исходников прячется, но считается', () => {
    host.ide(NAME).emit('output', { run: '1', session: '1.0', category: 'stderr', text: 'Could not read source map for file:///x\n' });
    host.ide(NAME).emit('output', { run: '1', session: '1.0', category: 'stdout', text: 'hello\n' });
    expect(debug.state.output.value.map((one) => one.text)).toEqual(['hello\n']);
    expect(debug.state.hiddenNoise.value).toBe(1);
  });
});

describe('условия, наблюдения, исключения', () => {
  let host: FakeHost;
  let debug: DebugPlugin;

  beforeEach(async () => {
    host = new FakeHost();
    (globalThis as Record<string, unknown>)['document'] ??= {};
    host.add(DocPlugin, '@mosetta/ide-plugin-doc');
    debug = host.add(DebugPlugin, NAME);
    const ide = host.ide(NAME);
    ide.answers.set('setExceptions', (params) => (params as { mode: string }).mode);
    ide.answers.set('setBreakpoints', (params) => {
      const asked = params as { path: string; breakpoints: Array<{ line: number }> };
      return { path: asked.path, breakpoints: asked.breakpoints.map((one) => ({ ...one, verified: false })) };
    });
    ide.answers.set('evaluate', (params) => ({ name: 'x', value: `<${(params as { expression: string }).expression}>`, ref: 0 }));
    await host.start();
  });

  it('окно условия открывается с тем, что стоит, и пишет точку целиком', async () => {
    host.ide(NAME).emit('breakpoints', { path: 'a.js', breakpoints: [{ line: 2, verified: true }, { line: 5, verified: true, condition: 'x > 1' }] });
    debug.openEdit('a.js', 5, { x: 0, y: 0 });
    expect(debug.state.edit.value?.ask).toEqual({ line: 5, condition: 'x > 1' });
    debug.state.draft({ logMessage: 'x is {x}' });
    expect(host.run('debug.edit.apply')).toBe(true);
    await until(() => debug.state.edit.value === null && debug.state.askAt('a.js', 5)?.logMessage === 'x is {x}');
    const sent = host.ide(NAME).calls.filter((call) => call.method === 'setBreakpoints').at(-1)!.params as { breakpoints: unknown[] };
    expect(sent.breakpoints).toEqual([{ line: 2 }, { line: 5, condition: 'x > 1', logMessage: 'x is {x}' }]);
  });

  it('наблюдение вычисляется на остановке и помнится по проекту', async () => {
    host.surface.workspaceCurrent.value = { id: 'w', root: '/p', name: 'p' } as never;
    debug.addWatch('items.length');
    expect(host.ide(NAME).remembered.get('watches:/p')?.value).toEqual(['items.length']);
    host.ide(NAME).answers.set('stack', () => [frame({ kind: 'project', path: 'a.js' })]);
    host.ide(NAME).answers.set('scopes', () => []);
    host.surface.docs.texts.set('a.js', '');
    host.ide(NAME).emit('runs', [RUN]);
    host.ide(NAME).emit('stopped', { run: '1', session: '1.0', stop: { thread: 0, reason: 'breakpoint' } });
    await until(() => debug.state.watches.value[0]?.value === '<items.length>');
    debug.removeWatch('items.length');
    expect(debug.state.watches.value).toEqual([]);
  });

  it('режим исключений уезжает на сервер, помнится по проекту и приходит событием', async () => {
    host.surface.workspaceCurrent.value = { id: 'w', root: '/p', name: 'p' } as never;
    await debug.setExceptions('uncaught');
    expect(debug.state.exceptions.value).toBe('uncaught');
    expect(host.ide(NAME).remembered.get('exceptions:/p')?.value).toBe('uncaught');
    host.ide(NAME).emit('exceptions', 'all');
    expect(debug.state.exceptions.value).toBe('all');
  });
});

describe('выражение под курсором', () => {
  it('берёт цепочку имён через точку, а не одно слово', () => {
    const text = '  const n = box.count + items.length;';
    expect(expressionAt(text, text.indexOf('count') + 2)).toBe('box.count');
    expect(expressionAt(text, text.indexOf('box'))).toBe('box');
    expect(expressionAt(text, text.indexOf('items') + 1)).toBe('items');
  });

  it('на пробеле и на числе молчит', () => {
    expect(expressionAt('a = 42;', 2)).toBeNull();
    expect(expressionAt('a = 42;', 5)).toBeNull();
  });
});

async function until(probe: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!probe()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
