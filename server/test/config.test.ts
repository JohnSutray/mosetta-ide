import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCommandId, type Keymap } from '@mosetta/ide-protocol';
import { jsonc } from '../src/config/jsonc.js';
import { ConfigStore, keymapRules } from '../src/config/store.js';
import { waitFor } from './helpers.js';

const SHIPPED = fileURLToPath(new URL('../../config', import.meta.url));
const FACTORY_KEYMAP = fileURLToPath(new URL('../src/config/keymap.json', import.meta.url));

describe('JSONC', () => {
  it('понимает комментарии и висячие запятые', () => {
    const parsed = jsonc.parse<{ a: number; b: string[] }>(
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
    const parsed = jsonc.parse<{ url: string; win: string }>(
      '{ "url": "https://example.com//x", "win": "C:\\\\a\\\\b" }',
      'test',
    );
    expect(parsed.url).toBe('https://example.com//x');
    expect(parsed.win).toBe('C:\\a\\b');
  });
});

describe('клавиши', () => {
  it('порядок модификаторов и регистр не важны', () => {
    expect(keymapRules.normalizeKey('Shift+Meta+S')).toBe(keymapRules.normalizeKey('meta+shift+s'));
    expect(keymapRules.normalizeKey('CONTROL+1')).toBe('control+1');
  });

  it('все физические модификаторы доживают до клиента', () => {
    expect(keymapRules.normalizeKey('meta+alt+shift+c')).toBe('meta+alt+shift+c');
    expect(keymapRules.normalizeKey('shift+alt+meta+c')).toBe('meta+alt+shift+c');
    expect(keymapRules.normalizeKey('control+alt+1')).toBe('control+alt+1');
  });

  it('клавиша зовётся и тем именем, что написано на ней', () => {
    expect(keymapRules.normalizeKey('Cmd+S')).toBe('meta+s');
    expect(keymapRules.normalizeKey('Command+Shift+S')).toBe('meta+shift+s');
    expect(keymapRules.normalizeKey('Win+1')).toBe('meta+1');
    expect(keymapRules.normalizeKey('Ctrl+Option+T')).toBe('control+alt+t');
    expect(keymapRules.normalizeKey('double:cmd')).toBe('double:meta');
    expect(keymapRules.normalizeKey('Esc')).toBe('escape');
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
    expect(keymapRules.validate(raw).bindings).toHaveLength(3);
  });

  it('а вот дубль в одной области по-прежнему выбрасывается', () => {
    const raw: Keymap = {
      version: 2,
      bindings: [
        { command: 'file.save', key: 'alt+s', where: ['browser:mac'] },
        { command: 'file.reload', key: 'alt+s', where: ['browser:mac'] },
      ],
    };
    expect(keymapRules.validate(raw).bindings).toHaveLength(1);
  });
});

describe('боевой конфиг в app/config', () => {
  it('keymap.json ссылается только на существующие команды', async () => {
    const raw = jsonc.parse<Keymap>(await fs.readFile(FACTORY_KEYMAP, 'utf8'), 'keymap.json');
    const fromPlugins = await pluginCommands();
    const dead = raw.bindings.filter(
      (b) => !isCommandId(b.command) && !fromPlugins.has(b.command),
    );
    expect(dead, `мёртвые клавиши: ${dead.map((d) => d.key).join(', ')}`).toEqual([]);
  });

  it('settings.json разбирается и накрывает дефолты', async () => {
    const store = await ConfigStore.load(SHIPPED);
    expect(store.settings.fs.noScan).toContain('node_modules');
    expect(store.settings.fs.maxFileMb).toBe(8);
    expect((store.settings.editor as { fontSize: number }).fontSize).toBe(13);
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
      const temp = path.join(dir, '.settings.json.tmp');
      await fs.writeFile(temp, JSON.stringify({ editor: { fontSize: size } }), 'utf8');
      await fs.rename(temp, target);
      await waitFor(
        () => (store.settings.editor as { fontSize?: number } | undefined)?.fontSize === size,
        `конфиг перечитан после сохранения ${size}`,
      );
    };

    await save(21);
    expect((store.settings.editor as { fontSize: number }).fontSize).toBe(21);
    await save(19);
    expect((store.settings.editor as { fontSize: number }).fontSize).toBe(19);

    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  }, 10_000);
});

describe('раскладка слоями (ADR-0214)', () => {
  const factory: Keymap = {
    version: 1,
    bindings: [
      { command: 'file.save', key: 'meta+s' },
      { command: 'file.reload', key: 'alt+r' },
      { command: 'tree.open', key: 'enter', when: 'tree' },
    ],
  };

  it('личная строка заменяет заводскую по месту, незнакомая дописывается', () => {
    const mine: Keymap = {
      version: 1,
      bindings: [
        { command: 'file.reload', key: 'meta+s' },
        { command: 'keys.show', key: 'meta+9' },
      ],
    };
    const merged = keymapRules.layer(keymapRules.validate(factory), keymapRules.validate(mine));
    expect(merged.bindings.map((b) => `${b.key}:${b.command}`)).toEqual([
      'meta+s:file.reload',
      'alt+r:file.reload',
      'enter:tree.open',
      'meta+9:keys.show',
    ]);
  });

  it('строка со снятием убирает заводскую, и снимается только СВОЁ место', () => {
    const mine: Keymap = {
      version: 1,
      bindings: [
        { command: '', key: 'alt+r', remove: true },
        { command: '', key: 'enter', remove: true },
      ],
    };
    const merged = keymapRules.layer(keymapRules.validate(factory), keymapRules.validate(mine));
    expect(merged.bindings.map((b) => b.key)).toEqual(['meta+s', 'enter']);
    expect(merged.bindings.find((b) => b.key === 'enter')?.when).toBe('tree');
  });

  it('снятое не доезжает до клиента вовсе', () => {
    const merged = keymapRules.layer(
      keymapRules.validate(factory),
      keymapRules.validate({ version: 1, bindings: [{ command: '', key: 'meta+s', remove: true }] }),
    );
    expect(merged.bindings.some((b) => b.remove)).toBe(false);
  });

  it('отличий нет — переносить нечего', () => {
    expect(keymapRules.diff(keymapRules.validate(factory), keymapRules.validate(factory)).bindings).toEqual([]);
  });

  it('отличия — это добавленное и перевешенное', () => {
    const mine: Keymap = {
      version: 1,
      bindings: [
        { command: 'file.save', key: 'meta+s' },
        { command: 'keys.show', key: 'alt+r' },
      ],
    };
    const diff = keymapRules.diff(keymapRules.validate(factory), keymapRules.validate(mine));
    expect(diff.bindings).toEqual([{ command: 'keys.show', key: 'alt+r' }]);
  });

  it('заводская строка, которой в старом файле не было, НЕ считается снятой', () => {
    const stale: Keymap = { version: 1, bindings: [{ command: 'file.save', key: 'meta+s' }] };
    const diff = keymapRules.diff(keymapRules.validate(factory), keymapRules.validate(stale));
    expect(diff.bindings).toEqual([]);
    const back = keymapRules.layer(keymapRules.validate(factory), keymapRules.validate(diff));
    expect(back.bindings.map((b) => b.command), 'клавиши поставки вернулись').toEqual([
      'file.save',
      'file.reload',
      'tree.open',
    ]);
  });
});

describe('переезд старого keymap.json (ADR-0214)', () => {
  it('свои отличия уезжают в settings.json, старый файл уходит в сторону', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-'));
    await fs.writeFile(
      path.join(dir, 'settings.json'),
      '// мой конфиг\n{\n  "tree": { "followEditor": true }\n}\n',
      'utf8',
    );
    const shipped = jsonc.parse<Keymap>(await fs.readFile(FACTORY_KEYMAP, 'utf8'), 'keymap.json');
    await fs.writeFile(
      path.join(dir, 'keymap.json'),
      JSON.stringify({ ...shipped, bindings: [...shipped.bindings, { command: 'keys.show', key: 'meta+f12' }] }, null, 2),
      'utf8',
    );

    const store = await ConfigStore.load(dir);
    const text = await fs.readFile(path.join(dir, 'settings.json'), 'utf8');
    expect(text, 'комментарий человека на месте').toContain('// мой конфиг');
    expect(store.current.user.keymap, 'в файле лежат только отличия').toBeTruthy();
    expect((store.current.user.keymap as unknown as Keymap).bindings).toEqual([
      { command: 'keys.show', key: 'meta+f12' },
    ]);
    expect(store.current.keymap.bindings.length, 'а действует заводская плюс своя').toBe(shipped.bindings.length + 1);
    expect(store.settings.tree, 'соседние настройки целы').toEqual({ followEditor: true });
    await expect(fs.access(path.join(dir, 'keymap.json'))).rejects.toThrow();
    await expect(fs.access(path.join(dir, 'keymap.json.retired'))).resolves.toBeUndefined();

    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('раскладка была заводской — в settings.json не появляется ничего', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-'));
    await fs.copyFile(FACTORY_KEYMAP, path.join(dir, 'keymap.json'));
    const store = await ConfigStore.load(dir);
    expect(store.current.user.keymap).toBeUndefined();
    await expect(fs.access(path.join(dir, 'settings.json'))).rejects.toThrow();
    expect(store.current.keymap.bindings.length).toBeGreaterThan(50);
    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('сломанный конфиг', () => {
  it('не роняет сервер, а откатывается на дефолты', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-'));
    await fs.writeFile(path.join(dir, 'settings.json'), '{ это не json', 'utf8');
    const store = await ConfigStore.load(dir);
    expect(store.settings.fs.maxFileMb).toBe(8);
    expect(store.settings.editor).toBeUndefined();
    expect(store.current.sources).toEqual([FACTORY_KEYMAP]);
    expect(store.current.keymap.bindings.length, 'клавиши при этом на месте').toBeGreaterThan(50);
    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('запись настройки', () => {
  it('две записи разом не теряют друг друга (ADR-0194)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-race-'));
    await fs.writeFile(path.join(dir, 'settings.json'), '{\n  "find": { "masks": ["*.ts"] }\n}\n', 'utf8');
    const store = await ConfigStore.load(dir);
    await Promise.all([store.set('find', 'masks', ['*.tsx']), store.set('find', 'masksOff', ['*.tsx'])]);
    const find = store.settings.find as { masks: string[]; masksOff: string[] };
    expect(find.masks).toEqual(['*.tsx']);
    expect(find.masksOff).toEqual(['*.tsx']);
    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });

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
    expect((store.settings.terminal as { shell: string }).shell).toBe('/bin/zsh');
    expect((store.settings.editor as { fontSize: number }).fontSize).toBe(15);
    expect((store.settings.terminal as { args?: string[] }).args).toBeUndefined();
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
