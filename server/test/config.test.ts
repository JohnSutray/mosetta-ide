import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaults } from '../src/config/defaults.js';
import { jsonc } from '../src/config/jsonc.js';
import { ConfigStore } from '../src/config/store.js';
import { waitFor } from './helpers.js';


describe('JSONC', () => {
  it('understands comments and trailing commas', () => {
    const parsed = jsonc.parse<{ a: number; b: string[] }>(
      `{
         // a line comment
         "a": 1, /* a block one */
         "b": ["x", "y",],
       }`,
      'test',
    );
    expect(parsed).toEqual({ a: 1, b: ['x', 'y'] });
  });

  it('a trailing comma and a comment work TOGETHER', () => {
    const parsed = jsonc.parse<{ fs: { noScan: string[] } }>(
      `{
         "fs": { "noScan": ["node_modules"] },
         // there is nothing after this, and here is why
       }`,
      'test',
    );
    expect(parsed.fs.noScan).toEqual(['node_modules']);
  });

  it('the same inside an array and through a block comment', () => {
    const parsed = jsonc.parse<{ a: number[] }>(
      `{ "a": [1, 2, /* and that is all */ ] }`,
      'test',
    );
    expect(parsed.a).toEqual([1, 2]);
  });

  it('a comma inside a string stays where it is', () => {
    const parsed = jsonc.parse<{ a: string; b: string[] }>('{ "a": "one, two", "b": ["x,"] }', 'test');
    expect(parsed.a).toBe('one, two');
    expect(parsed.b).toEqual(['x,']);
  });

  it('does not cut slashes inside strings', () => {
    const parsed = jsonc.parse<{ url: string; win: string }>(
      '{ "url": "https://example.com//x", "win": "C:\\\\a\\\\b" }',
      'test',
    );
    expect(parsed.url).toBe('https://example.com//x');
    expect(parsed.win).toBe('C:\\a\\b');
  });
});

describe('the real config', () => {
  /**
   * No file at all is the normal state: the repository ships no settings of its own, and
   * a fresh machine has none either. The store comes up on the code's defaults and says
   * so by naming no sources — which is what the settings window reads to tell a factory
   * value from mine.
   */
  it('a missing directory is legitimate: the defaults, and no sources', async () => {
    const store = await ConfigStore.load(path.join(os.tmpdir(), 'ide-config-absent', String(Date.now())));
    expect(store.current.sources).toEqual([]);
    expect(store.settings.fs.maxFileMb).toBe(defaults.settings.fs.maxFileMb);
    store.dispose();
  });

  it('a plugin\'s section travels as it is — the core does not know its shape', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-'));
    await fs.writeFile(
      path.join(dir, 'settings.json'),
      '{ "editor": { "fontSize": 21, "whatTheCoreDoesNotKnow": ["and has no business knowing"] } }',
      'utf8',
    );
    const store = await ConfigStore.load(dir);
    const editor = store.settings.editor as { fontSize: number; whatTheCoreDoesNotKnow: string[] };
    expect(editor.fontSize).toBe(21);
    expect(editor.whatTheCoreDoesNotKnow).toEqual(['and has no business knowing']);
    store.dispose();
  });
});

describe('watching the config', () => {
  it('survives an atomic save (a temporary file plus a rename)', async () => {
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
        `the config was not re-read after the save ${size}`,
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

describe('a broken config', () => {
  it('does not bring the server down but falls back to the defaults', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-'));
    await fs.writeFile(path.join(dir, 'settings.json'), '{ not json', 'utf8');
    const store = await ConfigStore.load(dir);
    expect(store.settings.fs.maxFileMb).toBe(8);
    expect(store.settings.editor).toBeUndefined();
    expect(store.current.sources).toEqual([]);
    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });
});

/**
 * Choosing a shell is the one setting the server writes itself. Checked end to end:
 * written → re-read → the bundle holds the new value, and the human's comments are
 * still in place.
 */
describe('writing a setting', () => {
  it('two writes at once do not lose each other', async () => {
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

  it('reaches the bundle and does not sweep the comments away', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-set-'));
    await fs.writeFile(
      path.join(dir, 'settings.json'),
      '{\n  // the font by hand\n  "editor": { "fontSize": 15 }\n}\n',
      'utf8',
    );
    const store = await ConfigStore.load(dir);

    const { rewritten } = await store.set('terminal', 'shell', '/bin/zsh');
    expect(rewritten).toBe(false);
    expect((store.settings.terminal as { shell: string }).shell).toBe('/bin/zsh');
    expect((store.settings.editor as { fontSize: number }).fontSize).toBe(15);
    expect((store.settings.terminal as { args?: string[] }).args).toBeUndefined();
    const raw = await fs.readFile(path.join(dir, 'settings.json'), 'utf8');
    expect(raw).toContain('// the font by hand');

    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
