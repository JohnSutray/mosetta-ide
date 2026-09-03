import { describe, expect, it } from 'vitest';
import type { SymbolSite } from '@ide/protocol';
import { FakeHost } from '@ide/api/testing';
import { activePick } from '@ide/ui';
import Editor from '@ide/plugin-editor';
import SymbolsPlugin from '../src/client.js';

function site(path: string, line: number, preview = 'foo()', isImport = false): SymbolSite {
  return { path, line, character: 0, preview, isImport };
}

async function raise() {
  const host = new FakeHost();
  host.add(Editor, '@ide/plugin-editor');
  const plugin = host.add(SymbolsPlugin, '@ide/plugin-symbols');
  await host.start();
  host.surface.openDoc.value = {
    path: 'a.ts',
    text: '',
    version: 1,
    revision: null,
    readOnly: false,
  } as never;
  return { host, symbols: plugin.symbols };
}

const HERE = { line: 3, character: 2, text: 'foo()', box: { x: 10, y: 20 } };

describe('символы', () => {
  it('единственное объявление в другом месте — прыгаем сразу, без списка', async () => {
    const { host, symbols } = await raise();
    host.surface.definitions.push(site('b.ts', 7));
    await symbols.ask(HERE);
    expect(host.surface.jumps).toEqual([{ path: 'b.ts', line: 7, character: 0 }]);
    expect(symbols.list.value).toBeNull();
  });

  it('стоим на объявлении — показываем использования и забираем стрелки', async () => {
    const { host, symbols } = await raise();
    host.surface.definitions.push(site('a.ts', 3));
    host.surface.referencesFound.push(site('a.ts', 3), site('c.ts', 1), site('d.ts', 9));
    host.surface.texts.set('c.ts', 'один\nдва');
    await symbols.ask(HERE);

    const list = symbols.list.value!;
    expect(list.kind).toBe('usages');
    expect(list.sites.map((one) => one.path)).toEqual(['c.ts', 'd.ts']);
    expect(activePick.value).not.toBeNull();

    activePick.value!.next();
    expect(symbols.list.value!.at).toBe(1);
    activePick.value!.accept();
    expect(host.surface.jumps.at(-1)).toEqual({ path: 'd.ts', line: 9, character: 0 });
    expect(activePick.value).toBeNull();
  });

  it('импорты спрятаны, пока кроме них есть что показать', async () => {
    const { host, symbols } = await raise();
    host.surface.referencesFound.push(site('c.ts', 1, "import { foo } from './a'", true), site('d.ts', 9));
    await symbols.ask(HERE);
    const list = symbols.list.value!;
    expect(symbols.shown(list).map((one) => one.path)).toEqual(['d.ts']);
    symbols.toggleImports();
    expect(symbols.shown(list).map((one) => one.path)).toEqual(['c.ts', 'd.ts']);
  });

  it('вопрос от редактора доходит до списка', async () => {
    const { host, symbols } = await raise();
    host.surface.referencesFound.push(site('c.ts', 1));
    host.plugin(Editor);
    const editor = host.plugin(Editor) as unknown as { symbolHandler: (spot: typeof HERE) => void };
    editor.symbolHandler(HERE);
    await new Promise((r) => setTimeout(r, 0));
    expect(symbols.list.value?.kind).toBe('usages');
  });
});
