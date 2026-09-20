import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

/**
 * Project settings live inside the repository itself: `.mosetta/settings.json`, a layer
 * over the human's personal file.
 *
 * Checked over a real socket and with real files: the whole point here is WHAT ended up
 * on disk, and in which file.
 */
describe('the project\'s settings', () => {
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
      '// personal\n{\n  "editor": { "fontSize": 13 },\n  "fs": { "maxFileMb": 9 }\n}\n',
      'utf8',
    );
    server = await withServer(60_000, configDir);
    root = await makeProject('project-config', {
      'src/a.ts': 'const a = 1;\n',
      '.mosetta/settings.json': '// the project has its own\n{\n  "editor": { "fontSize": 17 }\n}\n',
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

  it('the project layer beats the personal one, and what it left alone stays personal', async () => {
    const bundle = await c.call('config.get', null);
    expect((bundle.settings.editor as { fontSize: number }).fontSize).toBe(17);
    expect(bundle.settings.fs.maxFileMb, 'the project does not have this one — the value is mine').toBe(9);
    expect(bundle.project).toEqual({ editor: { fontSize: 17 } });
    expect(bundle.user.editor, 'the personal value has not gone anywhere').toEqual({ fontSize: 13 });
    expect(bundle.projectFile).toBe(projectFile());
  });

  it('a tab without a project sees no project layer', async () => {
    const other = await connect(server);
    const bundle = await other.call('config.get', null);
    expect((bundle.settings.editor as { fontSize: number }).fontSize).toBe(13);
    expect(bundle.project).toEqual({});
    expect(bundle.projectFile).toBeNull();
    await other.close();
  });

  it('a write into the project writes the repository\'s file and takes the key out of the personal one', async () => {
    await c.call('config.set', { section: 'fs', key: 'maxFileMb', value: 20, scope: 'project' });

    expect(await read(projectFile())).toContain('"maxFileMb": 20');
    expect(await read(projectFile()), 'the project\'s comment survives').toContain('// the project has its own');
    expect(await read(userFile()), 'a value has one home').not.toContain('maxFileMb');
    expect(await read(userFile()), 'the neighbours in the personal file survive').toContain('"fontSize": 13');

    const bundle = await c.call('config.get', null);
    expect(bundle.settings.fs.maxFileMb).toBe(20);
    expect(bundle.project.fs).toEqual({ maxFileMb: 20 });
  });

  it('a write to yourself takes the key out of the project file', async () => {
    await c.call('config.set', { section: 'editor', key: 'fontSize', value: 15 });

    expect(await read(userFile())).toContain('"fontSize": 15');
    expect(await read(projectFile()), 'the value has left the project').not.toContain('fontSize');
    const bundle = await c.call('config.get', null);
    expect((bundle.settings.editor as { fontSize: number }).fontSize).toBe(15);
    expect(bundle.project.editor ?? {}, 'the project value is gone').toEqual({});
  });

  it('a reset removes the value from BOTH files', async () => {
    await c.call('config.reset', { section: 'editor', key: 'fontSize' });

    expect(await read(userFile())).not.toContain('fontSize');
    expect(await read(projectFile())).not.toContain('fontSize');
    const bundle = await c.call('config.get', null);
    expect((bundle.settings.editor as { fontSize?: number } | undefined)?.fontSize).toBeUndefined();
  });

  it('the project does not override the keymap', async () => {
    await fs.writeFile(
      projectFile(),
      '{ "keymap": { "version": 1, "bindings": [{ "command": "file.save", "key": "meta+k" }] } }\n',
      'utf8',
    );
    const other = await connect(server);
    await other.call('workspace.open', { root });
    const bundle = await other.call('config.get', null);
    expect(bundle.project.keymap, 'the keymap section is not taken from the project file').toBeUndefined();
    expect(bundle.settings.keymap, 'and it does not reach the effective settings').toBeUndefined();
    await other.close();
  });
});
