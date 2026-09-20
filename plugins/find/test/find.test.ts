import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '@mosetta/ide-plugin-doc';
import LspPlugin from '@mosetta/ide-plugin-lsp';
import Editor from '@mosetta/ide-plugin-editor';
import FindPlugin from '../src/client.js';
import { FindState } from '../src/find.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * Find in a file. The mechanics are somebody else's (`@codemirror/search`), and what is
 * checked is not them but our promises: the counter is honest about the whole document,
 * the toggles change the answer, and moving to replace does not lose what was typed.
 */
const NAME = '@mosetta/ide-plugin-find';

function at(doc: string, from: number, to: number): EditorState {
  return EditorState.create({ doc, selection: EditorSelection.single(from, to) });
}

describe('the match counter', () => {
  it('counts over the whole document and knows which one we stand on', () => {
    const find = new FindState();
    find.term.value = 'ab';
    expect(find.countIn(at('ab xab AB', 4, 6))).toEqual({ current: 2, total: 3 });
    expect(find.countIn(at('ab xab AB', 0, 0))).toEqual({ current: 0, total: 3 });
  });

  it('case and whole words are toggles', () => {
    const find = new FindState();
    find.term.value = 'ab';
    find.caseSensitive.value = true;
    expect(find.countIn(at('ab xab AB', 0, 0))?.total).toBe(2);
    find.caseSensitive.value = false;
    find.words.value = true;
    expect(find.countIn(at('ab xab AB', 0, 0))?.total).toBe(2);
  });

  it('a regular expression: a newline is found, a broken one does not count', () => {
    const find = new FindState();
    find.regex.value = true;
    find.term.value = 'a\\nb';
    expect(find.countIn(at('a\nb a\nb', 0, 0))?.total).toBe(2);
    find.term.value = '(';
    expect(find.query().valid).toBe(false);
    expect(find.countIn(at('(', 0, 0))).toBe(null);
  });

  it('an empty term means there is nothing to count', () => {
    const find = new FindState();
    expect(find.countIn(at('anything at all', 0, 0))).toBe(null);
  });
});

describe('the find plugin', () => {
  async function up() {
    (globalThis as Record<string, unknown>)['document'] ??= {};
    const host = new FakeHost();
    host.add(UiPlugin, '@mosetta/ide-plugin-ui');
    host.add(DocPlugin, '@mosetta/ide-plugin-doc');
    host.add(LspPlugin, '@mosetta/ide-plugin-lsp');
    host.add(Editor, '@mosetta/ide-plugin-editor');
    const plugin = host.add(FindPlugin, NAME);
    await host.start();
    return { host, plugin };
  }

  it('enters the editor as an extension and declares its commands', async () => {
    const { host } = await up();
    expect(host.registry.all<{ id: string }>('editor.extension').map((one) => one.id)).toEqual(['find']);
    expect([...host.ide(NAME).commands.keys()]).toEqual(
      expect.arrayContaining(['find.open', 'find.replace', 'find.next', 'find.prev', 'find.close', 'find.replaceAll']),
    );
  });

  it('moving from find to replace and back does not lose what was typed', async () => {
    const { host, plugin } = await up();
    host.surface.runCommand('find.open');
    expect(plugin.find.mode.value).toBe('find');
    plugin.find.setTerm('the term');
    host.surface.runCommand('find.replace');
    expect(plugin.find.mode.value).toBe('replace');
    expect(plugin.find.term.value).toBe('the term');
    host.surface.runCommand('find.open');
    expect(plugin.find.mode.value).toBe('find');
    expect(plugin.find.term.value).toBe('the term');
    host.surface.runCommand('find.close');
    expect(plugin.find.mode.value).toBe('off');
  });

  it('multi-line is a toggle: a newline switches it on and off again', async () => {
    const { host, plugin } = await up();
    host.surface.runCommand('find.open');
    plugin.find.setTerm('a');
    expect(plugin.find.multiline.value).toBe(false);
    host.surface.runCommand('find.newline');
    expect(plugin.find.multiline.value).toBe(true);
    expect(plugin.find.term.value).toBe('a\n');
    host.surface.runCommand('find.newline');
    expect(plugin.find.multiline.value).toBe(false);
    expect(plugin.find.term.value).toBe('a');
    plugin.find.setTerm('a\nb');
    expect(plugin.find.multiline.value).toBe(true);
  });
});
