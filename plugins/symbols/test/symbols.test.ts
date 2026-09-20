import { describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import Editor from '@mosetta/ide-plugin-editor';
import DocPlugin from '@mosetta/ide-plugin-doc';
import LspPlugin, { type SymbolSite } from '@mosetta/ide-plugin-lsp';
import SymbolsPlugin from '../src/client.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * Declarations and usages as a plugin.
 *
 * One key for two actions: standing on a usage we jump to the declaration, standing on
 * the declaration we show who uses it. The list takes the arrows like any list with a
 * search field, and hides the imports while there is anything besides them.
 */
function site(path: string, line: number, preview = 'foo()', isImport = false): SymbolSite {
  return { path, line, character: 0, preview, isImport };
}

/** The language server's answers: put in by the test, handed over by a neighbour. */
const fake = { definitions: [] as SymbolSite[], referencesFound: [] as SymbolSite[] };

async function raise() {
  fake.definitions = [];
  fake.referencesFound = [];
  const host = new FakeHost();
  host.add(UiPlugin, '@mosetta/ide-plugin-ui');
  (globalThis as Record<string, unknown>)['document'] ??= {};
  host.add(DocPlugin, '@mosetta/ide-plugin-doc');
  host.add(LspPlugin, '@mosetta/ide-plugin-lsp');
  const lsp = host.ide('@mosetta/ide-plugin-lsp');
  lsp.answers.set('definition', () => fake.definitions);
  lsp.answers.set('references', () => fake.referencesFound);
  lsp.answers.set('status', () => []);
  lsp.answers.set('problems', () => []);
  lsp.answers.set('diagnostics', (params) => ({ path: (params as { path: string }).path, diagnostics: [] }));
  host.add(Editor, '@mosetta/ide-plugin-editor');
  const plugin = host.add(SymbolsPlugin, '@mosetta/ide-plugin-symbols');
  host.surface.docs.texts.set('b.ts', '');
  host.surface.docs.texts.set('d.ts', '');
  await host.start();
  host.plugin(DocPlugin).doc.open.value = {
    path: 'a.ts',
    text: '',
    version: 1,
    revision: null,
    readOnly: false,
  } as never;
  return { host, symbols: plugin.symbols };
}

const HERE = { line: 3, character: 2, text: 'foo()', box: { x: 10, y: 20 } };

describe('symbols', () => {
  it('a single declaration elsewhere — we jump at once, with no list', async () => {
    const { host, symbols } = await raise();
    fake.definitions.push(site('b.ts', 7));
    await symbols.ask(HERE);
    await new Promise((r) => setTimeout(r, 0));
    expect(host.plugin(DocPlugin).doc.pendingReveal.value).toMatchObject({ path: 'b.ts', line: 7, character: 0 });
    expect(symbols.list.value).toBeNull();
  });

  it('standing on the declaration — we show the usages and take the arrows', async () => {
    const { host, symbols } = await raise();
    fake.definitions.push(site('a.ts', 3));
    fake.referencesFound.push(site('a.ts', 3), site('c.ts', 1), site('d.ts', 9));
    host.surface.docs.texts.set('c.ts', 'one\ntwo');
    await symbols.ask(HERE);

    const list = symbols.list.value!;
    expect(list.kind).toBe('usages');
    expect(list.sites.map((one) => one.path)).toEqual(['c.ts', 'd.ts']);
    expect(host.plugin(UiPlugin).windows.activePick.value).not.toBeNull();

    host.plugin(UiPlugin).windows.activePick.value!.next();
    expect(symbols.list.value!.at).toBe(1);
    host.plugin(UiPlugin).windows.activePick.value!.accept();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.plugin(DocPlugin).doc.pendingReveal.value).toMatchObject({ path: 'd.ts', line: 9, character: 0 });
    expect(host.plugin(UiPlugin).windows.activePick.value).toBeNull();
  });

  it('the imports are hidden while there is anything else to show', async () => {
    const { symbols } = await raise();
    fake.referencesFound.push(site('c.ts', 1, "import { foo } from './a'", true), site('d.ts', 9));
    await symbols.ask(HERE);
    const list = symbols.list.value!;
    expect(symbols.shown(list).map((one) => one.path)).toEqual(['d.ts']);
    symbols.toggleImports();
    expect(symbols.shown(list).map((one) => one.path)).toEqual(['c.ts', 'd.ts']);
  });

  it('the question from the editor reaches the list', async () => {
    const { host, symbols } = await raise();
    fake.referencesFound.push(site('c.ts', 1));
    host.plugin(Editor);
    const editor = host.plugin(Editor) as unknown as { symbolHandler: (spot: typeof HERE) => void };
    editor.symbolHandler(HERE);
    await new Promise((r) => setTimeout(r, 0));
    expect(symbols.list.value?.kind).toBe('usages');
  });
});
