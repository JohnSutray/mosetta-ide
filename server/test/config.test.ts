import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonc } from '../src/config/jsonc.js';
import { ConfigStore } from '../src/config/store.js';
import { waitFor } from './helpers.js';

const SHIPPED = fileURLToPath(new URL('../../config', import.meta.url));

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

describe('боевой конфиг в app/config', () => {
  it('settings.json разбирается и накрывает дефолты', async () => {
    const store = await ConfigStore.load(SHIPPED);
    expect(store.settings.fs.noScan).toContain('node_modules');
    expect(store.settings.fs.maxFileMb).toBe(8);
    expect((store.settings.editor as { fontSize: number }).fontSize).toBe(13);
    expect(store.current.sources).toHaveLength(1);
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

describe('сломанный конфиг', () => {
  it('не роняет сервер, а откатывается на дефолты', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-'));
    await fs.writeFile(path.join(dir, 'settings.json'), '{ это не json', 'utf8');
    const store = await ConfigStore.load(dir);
    expect(store.settings.fs.maxFileMb).toBe(8);
    expect(store.settings.editor).toBeUndefined();
    expect(store.current.sources).toEqual([]);
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
