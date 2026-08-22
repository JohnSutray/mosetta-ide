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
    expect(normalizeKey('Shift+Mod+S')).toBe(normalizeKey('mod+shift+s'));
    expect(normalizeKey('MOD+1')).toBe('mod+1');
  });

  it('модификатор буфера обмена доживает до клиента', () => {
    expect(normalizeKey('Clip+Shift+C')).toBe('clip+shift+c');
    expect(normalizeKey('shift+clip+c')).toBe('clip+shift+c');

    const raw: Keymap = {
      version: 1,
      bindings: [{ command: 'tree.copy', key: 'clip+c', when: 'tree' }],
    };
    expect(validateKeymap(raw).bindings[0]!.key).toBe('clip+c');
  });

  it('клавиша на несуществующую команду выбрасывается, а не молчит', () => {
    const raw = {
      version: 1,
      bindings: [
        { command: 'file.save', key: 'mod+s' },
        { command: 'file.мертвец', key: 'mod+k' },
      ],
    } as unknown as Keymap;
    const clean = validateKeymap(raw);
    expect(clean.bindings.map((b) => b.command)).toEqual(['file.save']);
  });

  it('две команды на одну клавишу — вторая проигрывает явно', () => {
    const raw: Keymap = {
      version: 1,
      bindings: [
        { command: 'file.save', key: 'mod+s', when: 'editor' },
        { command: 'edit.undo', key: 'Mod+S', when: 'editor' },
      ],
    };
    expect(validateKeymap(raw).bindings).toHaveLength(1);
  });

  it('одна клавиша в разных контекстах — это разные слоты', () => {
    const raw: Keymap = {
      version: 1,
      bindings: [
        { command: 'file.save', key: 'mod+s', when: 'editor' },
        { command: 'edit.undo', key: 'mod+s', when: 'tree' },
      ],
    };
    expect(validateKeymap(raw).bindings).toHaveLength(2);
  });
});

describe('боевой конфиг в app/config', () => {
  it('keymap.json ссылается только на существующие команды', async () => {
    const raw = parseJsonc<Keymap>(
      await fs.readFile(path.join(SHIPPED, 'keymap.json'), 'utf8'),
      'keymap.json',
    );
    const dead = raw.bindings.filter((b) => !isCommandId(b.command));
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
