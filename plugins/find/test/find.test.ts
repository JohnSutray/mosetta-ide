import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { FakeHost } from '@ide/api/testing';
import DocPlugin from '@ide/plugin-doc';
import LspPlugin from '@ide/plugin-lsp';
import Editor from '@ide/plugin-editor';
import FindPlugin from '../src/client.js';
import { FindState } from '../src/find.js';
import UiPlugin from '@ide/ui';

const NAME = '@ide/plugin-find';

function at(doc: string, from: number, to: number): EditorState {
  return EditorState.create({ doc, selection: EditorSelection.single(from, to) });
}

describe('счётчик совпадений', () => {
  it('считает по всему документу и знает, на каком мы стоим', () => {
    const find = new FindState();
    find.term.value = 'ab';
    expect(find.countIn(at('ab xab AB', 4, 6))).toEqual({ current: 2, total: 3 });
    expect(find.countIn(at('ab xab AB', 0, 0))).toEqual({ current: 0, total: 3 });
  });

  it('регистр и целые слова — тумблеры', () => {
    const find = new FindState();
    find.term.value = 'ab';
    find.caseSensitive.value = true;
    expect(find.countIn(at('ab xab AB', 0, 0))?.total).toBe(2);
    find.caseSensitive.value = false;
    find.words.value = true;
    expect(find.countIn(at('ab xab AB', 0, 0))?.total).toBe(2);
  });

  it('регулярное выражение: перенос строки ищется, сломанное — не считается', () => {
    const find = new FindState();
    find.regex.value = true;
    find.term.value = 'a\\nb';
    expect(find.countIn(at('a\nb a\nb', 0, 0))?.total).toBe(2);
    find.term.value = '(';
    expect(find.query().valid).toBe(false);
    expect(find.countIn(at('(', 0, 0))).toBe(null);
  });

  it('пустое искомое — считать нечего', () => {
    const find = new FindState();
    expect(find.countIn(at('что угодно', 0, 0))).toBe(null);
  });
});

describe('плагин поиска', () => {
  async function up() {
    (globalThis as Record<string, unknown>)['document'] ??= {};
    const host = new FakeHost();
    host.add(UiPlugin, '@ide/ui');
    host.add(DocPlugin, '@ide/plugin-doc');
    host.add(LspPlugin, '@ide/plugin-lsp');
    host.add(Editor, '@ide/plugin-editor');
    const plugin = host.add(FindPlugin, NAME);
    await host.start();
    return { host, plugin };
  }

  it('входит в редактор расширением и объявляет команды', async () => {
    const { host } = await up();
    expect(host.registry.all<{ id: string }>('editor.extension').map((one) => one.id)).toEqual(['find']);
    expect([...host.ide(NAME).commands.keys()]).toEqual(
      expect.arrayContaining(['find.open', 'find.replace', 'find.next', 'find.prev', 'find.close', 'find.replaceAll']),
    );
  });

  it('переход из поиска в замену и обратно не теряет введённого', async () => {
    const { host, plugin } = await up();
    host.surface.runCommand('find.open');
    expect(plugin.find.mode.value).toBe('find');
    plugin.find.setTerm('искомое');
    host.surface.runCommand('find.replace');
    expect(plugin.find.mode.value).toBe('replace');
    expect(plugin.find.term.value).toBe('искомое');
    host.surface.runCommand('find.open');
    expect(plugin.find.mode.value).toBe('find');
    expect(plugin.find.term.value).toBe('искомое');
    host.surface.runCommand('find.close');
    expect(plugin.find.mode.value).toBe('off');
  });

  it('многострочность — тумблер: включается переносом и выключается им же (ADR-0195)', async () => {
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
