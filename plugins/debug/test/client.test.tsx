import { signal } from '@preact/signals';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '@mosetta/ide-plugin-doc';
import DebugPlugin, { expressionAt } from '../src/client.js';
import type { Frame, RunInfo } from '../src/types.js';

/**
 * The debugger's client half, as a plugin: what it asks of the host, what it puts into
 * the neighbours' keys, and what it does when the server says "we have stopped".
 */

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

describe('the debugger in the tab', () => {
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

  it('it sets up a panel on the right, a button and a toggle command by the common rules', () => {
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

  it('it enters the editor as an extension, the scripts window as an action, hovering as an answer', () => {
    expect(host.registry.authors('editor.extension')).toEqual([NAME]);
    expect(host.registry.all<{ id: string }>('scripts.action')[0]?.id).toBe('debug');
    expect(host.registry.all<{ id: string }>('editor.hover')[0]?.id).toBe('debug');
    const view = host.registry.all<{ opens: (path: string) => boolean; text: boolean }>('file.view')[0]!;
    expect(view.opens('debug:<node_internals>/internal/modules/cjs/loader')).toBe(true);
    expect(view.opens('src/app.ts')).toBe(false);
    expect(view.text).toBe(false);
  });

  it('"we have stopped" — it reads the stack, opens the file and stands on the line', async () => {
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

  it('a frame beyond the root opens in a view of its own under the name debug:', async () => {
    host.ide(NAME).answers.set('stack', () => [frame({ kind: 'adapter', name: '<node_internals>/x', reference: 5 }, 12)]);
    host.ide(NAME).emit('runs', [RUN]);
    host.ide(NAME).emit('stopped', { run: '1', session: '1.0', stop: { thread: 0, reason: 'step' } });
    const docs = host.plugin(DocPlugin);
    await until(() => docs.viewedFile.value !== null);
    expect(docs.viewedFile.value).toBe('debug:<node_internals>/x');
    expect(debug.state.foreign.get('debug:<node_internals>/x')).toMatchObject({ run: '1', session: '1.0', line: 12 });
  });

  it('the run has ended — the stack and the stop go out', async () => {
    host.ide(NAME).emit('runs', [RUN]);
    host.ide(NAME).emit('stopped', { run: '1', session: '1.0', stop: { thread: 0, reason: 'breakpoint' } });
    await until(() => debug.state.frames.value.length > 0);
    host.ide(NAME).emit('runs', [{ ...RUN, state: 'ended' }]);
    expect(debug.state.paused.value).toBeNull();
    expect(debug.state.frames.value).toEqual([]);
  });

  it('attached to a project — it asks for the runs and the breakpoints; to an empty server it returns its own', async () => {
    const ide = host.ide(NAME);
    host.surface.workspaceCurrent.value = { id: 'w', root: '/p', name: 'p' } as never;
    ide.remembered.set('breakpoints:/p', signal({ 'plain.js': [{ line: 4 }] }));
    host.surface.project.value = { id: 'w', root: '/p', name: 'p' } as never;
    await until(() => ide.calls.some((call) => call.method === 'setBreakpoints'));
    expect(ide.calls.map((call) => call.method)).toEqual(expect.arrayContaining(['runs', 'breakpoints', 'setBreakpoints']));
    expect(debug.state.linesOf('plain.js')).toEqual([4]);
  });

  it('what is unsaved holds the run back until it has been answered', async () => {
    const ide = host.ide(NAME);
    host.surface.docs.unsavedPaths.add('src/a.ts');
    void debug.launch({ name: 'plain.js', program: 'plain.js' });
    await new Promise((done) => setTimeout(done, 20));
    expect(ide.calls.some((call) => call.method === 'launch')).toBe(false);
    expect(wish().open.value).toBe(false);
  });

  it('with autosave the run does not ask: it writes the files and goes', async () => {
    const ide = host.ide(NAME);
    host.setSettings({ doc: { autosave: 'focusLost' } });
    host.surface.docs.texts.set('src/a.ts', 'let x = 1\n');
    host.surface.docs.unsavedPaths.add('src/a.ts');
    ide.answers.set('launch', () => RUN);
    await debug.launch({ name: 'plain.js', program: 'plain.js' });
    expect(host.surface.docs.saved).toEqual(['src/a.ts']);
    expect(ide.calls.some((call) => call.method === 'launch')).toBe(true);
  });

  it('the output: the noise about source maps is hidden, but counted', () => {
    host.ide(NAME).emit('output', { run: '1', session: '1.0', category: 'stderr', text: 'Could not read source map for file:///x\n' });
    host.ide(NAME).emit('output', { run: '1', session: '1.0', category: 'stdout', text: 'hello\n' });
    expect(debug.state.output.value.map((one) => one.text)).toEqual(['hello\n']);
    expect(debug.state.hiddenNoise.value).toBe(1);
  });
});

describe('conditions, watches, exceptions', () => {
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

  it('the condition window opens with what stands there, and writes the breakpoint whole', async () => {
    host.ide(NAME).emit('breakpoints', { path: 'a.js', breakpoints: [{ line: 2, verified: true }, { line: 5, verified: true, condition: 'x > 1' }] });
    debug.openEdit('a.js', 5, { x: 0, y: 0 });
    expect(debug.state.edit.value?.ask).toEqual({ line: 5, condition: 'x > 1' });
    debug.state.draft({ logMessage: 'x is {x}' });
    expect(host.run('debug.edit.apply')).toBe(true);
    await until(() => debug.state.edit.value === null && debug.state.askAt('a.js', 5)?.logMessage === 'x is {x}');
    const sent = host.ide(NAME).calls.filter((call) => call.method === 'setBreakpoints').at(-1)!.params as { breakpoints: unknown[] };
    expect(sent.breakpoints).toEqual([{ line: 2 }, { line: 5, condition: 'x > 1', logMessage: 'x is {x}' }]);
  });

  it('a watch is evaluated at a stop and is remembered per project', async () => {
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

  it('the exceptions mode travels to the server, is remembered per project and arrives as an event', async () => {
    host.surface.workspaceCurrent.value = { id: 'w', root: '/p', name: 'p' } as never;
    await debug.setExceptions('uncaught');
    expect(debug.state.exceptions.value).toBe('uncaught');
    expect(host.ide(NAME).remembered.get('exceptions:/p')?.value).toBe('uncaught');
    host.ide(NAME).emit('exceptions', 'all');
    expect(debug.state.exceptions.value).toBe('all');
  });
});

describe('the expression under the cursor', () => {
  it('it takes a chain of names through dots rather than one word', () => {
    const text = '  const n = box.count + items.length;';
    expect(expressionAt(text, text.indexOf('count') + 2)).toBe('box.count');
    expect(expressionAt(text, text.indexOf('box'))).toBe('box');
    expect(expressionAt(text, text.indexOf('items') + 1)).toBe('items');
  });

  it('on a space and on a number it says nothing', () => {
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
