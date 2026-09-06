import { beforeEach, describe, expect, it } from 'vitest';
import type { DocState } from '@ide/protocol';
import { FakeHost, nodes, of } from '@ide/api/testing';
import LspPlugin from '@ide/plugin-lsp';
import Editor from '../src/client.js';

const NAME = '@ide/plugin-editor';

function doc(path: string, extra: Partial<DocState> = {}): DocState {
  return { path, text: 'привет', version: 1, truncated: false, ...extra } as DocState;
}

describe('редактор', () => {
  let host: FakeHost;

  beforeEach(async () => {
    host = new FakeHost();
    host.add(LspPlugin, '@ide/plugin-lsp');
    host.add(Editor, NAME);
    await host.start();
  });

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

  it('объявляет, чем можно занять пустое место, до всякой активации', () => {
    const early = new FakeHost();
    early.add(Editor, NAME);
    expect(early.registry.declared()).toEqual(['editor.empty']);
  });

  it('занимает середину и не имеет ширины', () => {
    expect(head().side).toBe('main');
    expect(head().defaultWidth).toBeUndefined();
    expect(head().minWidth).toBeUndefined();
  });

  it('единственная панель, открытая с самого начала', () => {
    expect(host.ide(NAME).remembered.has('panel.open')).toBe(true);
    expect(open().value).toBe(true);
  });

  it('переключается той же командой, что зовёт кнопка', () => {
    expect(host.run('panel.editor')).toBe(true);
    expect(open().value).toBe(false);
    host.run('panel.editor');
    expect(open().value).toBe(true);
  });

  it('просит кнопку сам и держит ТОТ ЖЕ сигнал', () => {
    const wish = host.registry.all<{ command: string; active: { value: boolean } }>(
      'toolbar.button',
    )[0]!;
    expect(wish.command).toBe('panel.editor');
    expect(wish.active).toBe(open());
  });

  it('приносит свои стили', () => {
    expect(host.ide(NAME).styles.join('')).toContain('.editor');
  });

  it('заголовок — путь открытого файла, а пусто — имя панели', () => {
    expect(head().heading!()).toBeNull();
    host.surface.openDoc.value = doc('src/app.tsx');
    expect(head().heading!()).toBe('src/app.tsx');
    expect(head().title).toBe('panel.editor.empty');
  });

  it('метки говорят, можно ли верить тому, что на экране', () => {
    const tags = () =>
      nodes(head().badges!())
        .filter((one) => String(one.props['class']).startsWith('tag'))
        .map((one) => one.props['children']);
    expect(head().badges!()).toBeNull();

    host.surface.openDoc.value = doc('a.ts');
    expect(tags()).toEqual([]);

    host.surface.dirty.value = true;
    expect(tags()).toEqual(['modified']);

    host.surface.openDoc.value = doc('a.ts', { truncated: true });
    expect(tags()).toEqual(['read-only', 'modified']);
  });

  it('крестик значит разное: с файлом закрывает файл, без файла — панель', () => {
    host.surface.openDoc.value = doc('a.ts');
    head().close!();
    expect(host.surface.closed).toBe(1);
    expect(open().value).toBe(true);

    head().close!();
    expect(host.surface.closed).toBe(1);
    expect(open().value).toBe(false);
  });

  it('открыли файл — показывается сам', () => {
    open().value = false;
    host.surface.openDoc.value = doc('a.ts');
    expect(open().value).toBe(true);
  });

  it('закрыли панель при открытом файле — сама не лезет обратно', () => {
    host.surface.openDoc.value = doc('a.ts');
    open().value = false;
    host.surface.dirty.value = true;
    expect(open().value).toBe(false);
  });

  it('пустое место занимает тот, кто попросил', () => {
    const body = () => head().view();
    expect(nodes(body()).map((one) => one.props['children'])).toContain('editor.nothing');

    host.registry.add(
      'editor.empty',
      { id: 'sheep', view: () => <i data-id="sheep" /> },
      '@ide/plugin-sheep',
    );
    expect(nodes(body()).some((one) => one.props['data-id'] === 'sheep')).toBe(true);
  });

  it('правки текста приносит он, а не ядро', () => {
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
      expect(commands, `${id}: команду никто не объявил`).toContain(id);
    }
  });

  it('без живого редактора правки молчат, а не падают', () => {
    const asked: unknown[] = [];
    host.plugin(Editor).onSymbolAsk((spot) => asked.push(spot));
    expect(host.run('edit.undo')).toBe(true);
    expect(host.run('symbol.goto')).toBe(true);
    expect(asked).toEqual([]);
  });

  it('без настроек не рисует ничего: шрифт и табы приезжают с сервера', () => {
    host.surface.openDoc.value = doc('a.ts');
    expect(head().view()).toBeNull();
  });

  it('есть настройки — отдаёт редактор с документом', () => {
    host.surface.openDoc.value = doc('a.ts');
    host.setSettings({ editor: { fontFamily: 'JetBrains Mono', fontSize: 13, tabSize: 2 } });
    const drawn = of(head().view(), 'CodeEditor');
    expect(drawn.length + nodes(head().view()).length).toBeGreaterThan(0);
  });
});
