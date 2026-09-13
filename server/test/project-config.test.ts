import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

describe('проектные настройки (ADR-0214)', () => {
  let server: RunningServer;
  let configDir: string;
  let root: string;
  let c: TestClient;

  const projectFile = () => path.join(root, '.mosetta', 'settings.json');
  const userFile = () => path.join(configDir, 'settings.json');
  const read = async (file: string) => {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      return null;
    }
  };

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-config-'));
    await fs.writeFile(
      userFile(),
      '// личный\n{\n  "editor": { "fontSize": 13 },\n  "fs": { "maxFileMb": 9 }\n}\n',
      'utf8',
    );
    server = await withServer(60_000, configDir);
    root = await makeProject('project-config', {
      'src/a.ts': 'const a = 1;\n',
      '.mosetta/settings.json': '// у проекта свой\n{\n  "editor": { "fontSize": 17 }\n}\n',
    });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
    await fs.rm(configDir, { recursive: true, force: true });
  });

  it('проектный слой перебивает личный, а нетронутое остаётся личным', async () => {
    const bundle = await c.call('config.get', null);
    expect((bundle.settings.editor as { fontSize: number }).fontSize).toBe(17);
    expect(bundle.settings.fs.maxFileMb, 'этого у проекта нет — значение моё').toBe(9);
    expect(bundle.project).toEqual({ editor: { fontSize: 17 } });
    expect(bundle.user.editor, 'личное значение никуда не делось').toEqual({ fontSize: 13 });
    expect(bundle.projectFile).toBe(projectFile());
  });

  it('вкладка без проекта проектного слоя не видит', async () => {
    const other = await connect(server);
    const bundle = await other.call('config.get', null);
    expect((bundle.settings.editor as { fontSize: number }).fontSize).toBe(13);
    expect(bundle.project).toEqual({});
    expect(bundle.projectFile).toBeNull();
    await other.close();
  });

  it('запись в проект пишет файл репозитория и уносит ключ из личного', async () => {
    await c.call('config.set', { section: 'fs', key: 'maxFileMb', value: 20, scope: 'project' });

    expect(await read(projectFile())).toContain('"maxFileMb": 20');
    expect(await read(projectFile()), 'комментарий проекта цел').toContain('// у проекта свой');
    expect(await read(userFile()), 'дом у значения один').not.toContain('maxFileMb');
    expect(await read(userFile()), 'соседи в личном файле целы').toContain('"fontSize": 13');

    const bundle = await c.call('config.get', null);
    expect(bundle.settings.fs.maxFileMb).toBe(20);
    expect(bundle.project.fs).toEqual({ maxFileMb: 20 });
  });

  it('запись к себе уносит ключ из проектного файла', async () => {
    await c.call('config.set', { section: 'editor', key: 'fontSize', value: 15 });

    expect(await read(userFile())).toContain('"fontSize": 15');
    expect(await read(projectFile()), 'из проекта значение ушло').not.toContain('fontSize');
    const bundle = await c.call('config.get', null);
    expect((bundle.settings.editor as { fontSize: number }).fontSize).toBe(15);
    expect(bundle.project.editor ?? {}, 'проектного значения больше нет').toEqual({});
  });

  it('сброс убирает значение из ОБОИХ файлов', async () => {
    await c.call('config.reset', { section: 'editor', key: 'fontSize' });

    expect(await read(userFile())).not.toContain('fontSize');
    expect(await read(projectFile())).not.toContain('fontSize');
    const bundle = await c.call('config.get', null);
    expect((bundle.settings.editor as { fontSize?: number } | undefined)?.fontSize).toBeUndefined();
  });

  it('раскладку проект не перебивает', async () => {
    await fs.writeFile(
      projectFile(),
      '{ "keymap": { "version": 1, "bindings": [{ "command": "file.save", "key": "meta+k" }] } }\n',
      'utf8',
    );
    const other = await connect(server);
    await other.call('workspace.open', { root });
    const bundle = await other.call('config.get', null);
    expect(bundle.project.keymap).toBeUndefined();
    expect(bundle.keymap.bindings.some((b) => b.key === 'meta+k' && b.command === 'file.save')).toBe(false);
    expect(bundle.keymap.bindings.length, 'заводская раскладка на месте').toBeGreaterThan(50);
    await other.close();
  });
});
