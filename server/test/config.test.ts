import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCommandId, type Keymap } from '@ide/protocol';
import { parseJsonc } from '../src/config/jsonc.js';
import { ConfigStore, normalizeKey, validateKeymap } from '../src/config/store.js';

const SHIPPED = fileURLToPath(new URL('../../config', import.meta.url));

describe('JSONC', () => {
  it('понимает комментарии и висячие запятые', () => {
    const parsed = parseJsonc<{ a: number; b: string[] }>(
      `{
         // строчный
         "a": 1, 
         "b": ["x", "y",],
       }`,
      'test',
    );
    expect(parsed).toEqual({ a: 1, b: ['x', 'y'] });
  });

  it('не режет слэши внутри строк', () => {
    const parsed = parseJsonc<{ url: string; win: string }>(
      '{ "url": "https://example.com//x", "win": "C:\\\\a\\\\b" }',
      'test',
    );
    expect(parsed.url).toBe('https://example.com//x');
    expect(parsed.win).toBe('C:\\a\\b');
  });
});

describe('клавиши', () => {
  it('порядок модификаторов и регистр не важны', () => {
    expect(normalizeKey('Shift+Meta+S')).toBe(normalizeKey('meta+shift+s'));
    expect(normalizeKey('CONTROL+1')).toBe('control+1');
  });

  it('все физические модификаторы доживают до клиента', () => {
    expect(normalizeKey('meta+alt+shift+c')).toBe('meta+alt+shift+c');
    expect(normalizeKey('shift+alt+meta+c')).toBe('meta+alt+shift+c');
    expect(normalizeKey('control+alt+1')).toBe('control+alt+1');
  });

  it('клавиша зовётся и тем именем, что написано на ней', () => {
    expect(normalizeKey('Cmd+S')).toBe('meta+s');
    expect(normalizeKey('Command+Shift+S')).toBe('meta+shift+s');
    expect(normalizeKey('Win+1')).toBe('meta+1');
    expect(normalizeKey('Ctrl+Option+T')).toBe('control+alt+t');
    expect(normalizeKey('double:cmd')).toBe('double:meta');
    expect(normalizeKey('Esc')).toBe('escape');
  });

  it('одна клавиша в разных окружениях — не дубль, а вторая раскладка', () => {
    const raw: Keymap = {
      version: 2,
      bindings: [
        { command: 'file.save', key: 'alt+s', where: ['browser:mac'] },
        { command: 'file.save', key: 'meta+s', where: ['electron:mac'] },
        { command: 'file.save', key: 'control+s', where: ['browser:win'] },
      ],
    };
    expect(validateKeymap(raw).bindings).toHaveLength(3);
  });

  it('а вот дубль в одной области по-прежнему выбрасывается', () => {
    const raw: Keymap = {
      version: 2,
      bindings: [
        { command: 'file.save', key: 'alt+s', where: ['browser:mac'] },
        { command: 'file.reload', key: 'alt+s', where: ['browser:mac'] },
      ],
    };
    expect(validateKeymap(raw).bindings).toHaveLength(1);
  });
});

describe('боевой конфиг в app/config', () => {
  it('keymap.json ссылается только на существующие команды', async () => {
    const raw = parseJsonc<Keymap>(
      await fs.readFile(path.join(SHIPPED, 'keymap.json'), 'utf8'),
      'keymap.json',
    );
    const fromPlugins = await pluginCommands();
    const dead = raw.bindings.filter(
      (b) => !isCommandId(b.command) && !fromPlugins.has(b.command),
    );
    expect(dead, `мёртвые клавиши: ${dead.map((d) => d.key).join(', ')}`).toEqual([]);
  });

  it('settings.json разбирается и накрывает дефолты', async () => {
    const store = await ConfigStore.load(SHIPPED);
    expect(store.settings.fs.noScan).toContain('node_modules');
    expect(store.settings.editor.caretWidth).toBe(2);
    expect(store.current.sources).toHaveLength(2);
    store.dispose();
  });
});

describe('слежение за конфигом', () => {
  it('переживает атомарное сохранение (временный файл + переименование)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-'));
    const target = path.join(dir, 'settings.json');
    await fs.writeFile(target, JSON.stringify({ editor: { fontSize: 13 } }), 'utf8');

    const store = await ConfigStore.load(dir);
    store.watch();

    const save = async (size: number) => {
      const waiting = new Promise<void>((resolve) => {
        const off = store.onChange(() => {
          off();
          resolve();
        });
      });
      const temp = path.join(dir, '.settings.json.tmp');
      await fs.writeFile(temp, JSON.stringify({ editor: { fontSize: size } }), 'utf8');
      await fs.rename(temp, target);
      await Promise.race([
        waiting,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`конфиг не перечитан после сохранения ${size}`)), 3000),
        ),
      ]);
    };

    await save(21);
    expect(store.settings.editor.fontSize).toBe(21);
    await save(19);
    expect(store.settings.editor.fontSize).toBe(19);

    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  }, 10_000);
});

describe('сломанный конфиг', () => {
  it('не роняет сервер, а откатывается на дефолты', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-'));
    await fs.writeFile(path.join(dir, 'settings.json'), '{ это не json', 'utf8');
    const store = await ConfigStore.load(dir);
    expect(store.settings.editor.fontSize).toBe(13);
    expect(store.current.sources).toEqual([]);
    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('запись настройки', () => {
  it('доезжает до бандла и не сносит комментарии', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-set-'));
    await fs.writeFile(
      path.join(dir, 'settings.json'),
      '{\n  // шрифт руками\n  "editor": { "fontSize": 15 }\n}\n',
      'utf8',
    );
    const store = await ConfigStore.load(dir);

    const { rewritten } = await store.set('terminal', 'shell', '/bin/zsh');
    expect(rewritten).toBe(false);
    expect(store.settings.terminal.shell).toBe('/bin/zsh');
    expect(store.settings.editor.fontSize).toBe(15);
    expect(store.settings.terminal.args).toEqual([]);
    const raw = await fs.readFile(path.join(dir, 'settings.json'), 'utf8');
    expect(raw).toContain('// шрифт руками');

    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });
});

async function pluginCommands(): Promise<Set<string>> {
  const dir = fileURLToPath(new URL('../../plugins', import.meta.url));
  const out = new Set<string>();
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const raw = await fs
      .readFile(path.join(dir, name, 'package.json'), 'utf8')
      .catch(() => null);
    if (!raw) continue;
    const pkg = JSON.parse(raw) as { ide?: { commands?: Record<string, string> } };
    for (const id of Object.keys(pkg.ide?.commands ?? {})) out.add(id);
  }
  return out;
}
