import { beforeEach, describe, expect, it } from 'vitest';
import type { DocState } from '@mosetta/ide-protocol';
import { FakeHost, nodes, of } from '@mosetta/ide-api/testing';
import LspPlugin from '@mosetta/ide-plugin-lsp';
import DocPlugin from '@mosetta/ide-plugin-doc';
import CodePlugin from '@mosetta/ide-plugin-code';
import ThemePlugin from '@mosetta/ide-plugin-theme';
import Editor from '../src/client.js';

/**
 * The editor as a plugin.
 *
 * CodeMirror itself is not brought up here: there is neither a DOM nor a screen in a
 * test, and checking somebody else's library is not our job. What is checked is the
 * editor's CONVERSATION with the host: what it asks for, what it declares, and what it
 * does on a keystroke. Exactly what used to be spread across the core's frame and
 * checked by nothing.
 */

const NAME = '@mosetta/ide-plugin-editor';

function doc(path: string, extra: Partial<DocState> = {}): DocState {
  return { path, text: 'hello', version: 1, truncated: false, ...extra } as DocState;
}

describe('the editor', () => {
  let host: FakeHost;

  beforeEach(async () => {
    host = new FakeHost();
    (globalThis as Record<string, unknown>)['document'] ??= {};
    host.add(DocPlugin, '@mosetta/ide-plugin-doc');
    host.add(LspPlugin, '@mosetta/ide-plugin-lsp');
    host.add(ThemePlugin, '@mosetta/ide-plugin-theme');
    host.add(CodePlugin, '@mosetta/ide-plugin-code');
    host.add(Editor, NAME);
    await host.start();
  });

  /** The wish about a column: the layout reads it, if there is one. */
  const head = () =>
    host.registry.all<{
      id: string;
      title: string;
      side: string;
      open: { value: boolean };
      view: () => unknown;
      heading?: () => string | null;
      badges?: () => unknown;
      close?: () => void;
      defaultWidth?: number;
      minWidth?: number;
    }>('panel')[0]!;
  const open = () => head().open;

  it('declares its keys before any activation', () => {
    const early = new FakeHost();
    early.add(Editor, NAME);
    expect([...early.registry.declared()].sort()).toEqual(['editor.empty', 'editor.extension', 'editor.hover', 'file.view']);
  });

  it('takes the middle and has no width', () => {
    expect(head().side).toBe('main');
    expect(head().defaultWidth).toBeUndefined();
    expect(head().minWidth).toBeUndefined();
  });

  it('the one panel open from the very start', () => {
    expect(host.ide(NAME).remembered.has('panel.open')).toBe(true);
    expect(open().value).toBe(true);
  });

  it('toggles by the same command the button calls', () => {
    expect(host.run('panel.editor')).toBe(true);
    expect(open().value).toBe(false);
    host.run('panel.editor');
    expect(open().value).toBe(true);
  });

  it('asks for the button itself and holds THE SAME signal', () => {
    const wish = host.registry.all<{ command: string; active: { value: boolean } }>(
      'toolbar.button',
    )[0]!;
    expect(wish.command).toBe('panel.editor');
    expect(wish.active).toBe(open());
  });

  it('brings its own styles', () => {
    expect(host.ide(NAME).styles.join('')).toContain('.editor');
  });

  it('the title is the open file\'s path, and empty means the panel\'s name', () => {
    expect(head().heading!()).toBeNull();
    host.plugin(DocPlugin).doc.open.value = doc('src/app.tsx');
    expect(head().heading!()).toBe('src/app.tsx');
    expect(head().title).toBe('panel.editor.empty');
  });

  it('the marks say whether what is on screen can be trusted', () => {
    const tags = () =>
      nodes(head().badges!())
        .filter((one) => String(one.props['class']).startsWith('tag'))
        .map((one) => one.props['children']);
    expect(head().badges!()).toBeNull();

    host.plugin(DocPlugin).doc.open.value = doc('a.ts');
    expect(tags()).toEqual([]);

    host.plugin(DocPlugin).doc.dirty.value = true;
    expect(tags()).toEqual(['modified']);

    host.plugin(DocPlugin).doc.open.value = doc('a.ts', { truncated: true });
    expect(tags()).toEqual(['read-only', 'modified']);
  });

  it('the cross means different things: with a file it closes the file, without one the panel', async () => {
    host.plugin(DocPlugin).doc.open.value = doc('a.ts');
    head().close!();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.surface.docs.closed).toHaveLength(1);
    expect(open().value).toBe(true);

    head().close!();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.surface.docs.closed).toHaveLength(1);
    expect(open().value).toBe(false);
  });

  it('a file was opened — it shows itself', () => {
    open().value = false;
    host.plugin(DocPlugin).doc.open.value = doc('a.ts');
    expect(open().value).toBe(true);
  });

  it('the panel was closed with a file open — it does not force itself back', () => {
    host.plugin(DocPlugin).doc.open.value = doc('a.ts');
    open().value = false;
    host.plugin(DocPlugin).doc.dirty.value = true;
    expect(open().value).toBe(false);
  });

  it('the empty space is taken by whoever asked for it', () => {
    const body = () => head().view();
    expect(nodes(body()).map((one) => one.props['children'])).toContain('editor.nothing');

    host.registry.add(
      'editor.empty',
      { id: 'sheep', view: () => <i data-id="sheep" /> },
      '@mosetta/ide-plugin-sheep',
    );
    expect(nodes(body()).some((one) => one.props['data-id'] === 'sheep')).toBe(true);
  });

  it('a view of its own took the file on — it draws it rather than CodeMirror', () => {
    host.registry.add(
      'file.view',
      {
        id: 'markdown',
        opens: (path: string) => path.endsWith('.md'),
        view: (file: { path: string }) => <i data-id="md" data-path={file.path} />,
      },
      '@mosetta/ide-plugin-markdown',
    );
    host.plugin(DocPlugin).doc.open.value = doc('README.md');
    expect(nodes(head().view()).some((one) => one.props['data-id'] === 'md')).toBe(true);

    host.plugin(DocPlugin).doc.open.value = doc('a.ts');
    expect(nodes(head().view()).some((one) => one.props['data-id'] === 'md')).toBe(false);
  });

  it('a file opened by something other than a document is drawn by whoever took it on', () => {
    host.registry.add(
      'file.view',
      { id: 'image', opens: (path: string) => path.endsWith('.png'), text: false, view: () => <i data-id="png" /> },
      '@mosetta/ide-plugin-image',
    );
    host.plugin(DocPlugin).doc.viewed.value = 'logo.png';
    expect(nodes(head().view()).some((one) => one.props['data-id'] === 'png')).toBe(true);
    expect(head().heading!()).toBe('logo.png');
  });

  it('text edits are brought by it rather than by the core', () => {
    const commands = host.commands();
    for (const id of [
      'edit.undo',
      'edit.redo',
      'edit.deleteLine',
      'edit.duplicateLine',
      'edit.toggleComment',
      'edit.moveLineUp',
      'edit.moveLineDown',
      'edit.addCursorAbove',
      'edit.addCursorBelow',
      'edit.wordLeft',
      'edit.wordRight',
      'edit.selectWordLeft',
      'edit.selectWordRight',
      'edit.indent',
      'edit.unindent',
      'symbol.goto',
    ]) {
      expect(commands, `${id}: nobody declared the command`).toContain(id);
    }
  });

  it('without a live editor the edits stay silent rather than crashing', () => {
    const asked: unknown[] = [];
    host.plugin(Editor).onSymbolAsk((spot) => asked.push(spot));
    expect(host.run('edit.undo')).toBe(true);
    expect(host.run('symbol.goto')).toBe(true);
    expect(asked).toEqual([]);
  });

  it('without settings it draws nothing: the font and the tabs arrive from the server', () => {
    host.plugin(DocPlugin).doc.open.value = doc('a.ts');
    expect(head().view()).toBeNull();
  });

  it('with settings it hands over an editor holding the document', () => {
    host.plugin(DocPlugin).doc.open.value = doc('a.ts');
    host.setSettings({ editor: { fontFamily: 'JetBrains Mono', fontSize: 13, tabSize: 2 } });
    const drawn = of(head().view(), 'CodeEditor');
    expect(drawn.length + nodes(head().view()).length).toBeGreaterThan(0);
  });
});
