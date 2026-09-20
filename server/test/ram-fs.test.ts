import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunningServer } from '../src/server.js';
import os from 'node:os';
import { connect, makeProject, removeProject, waitFor, withServer, type TestClient } from './helpers.js';

interface Hit {
  kind: string;
  label: string;
  path: string;
  line?: number;
  matches: number[];
}
async function search(c: TestClient, params: { query: string; limit?: number; kinds?: string[] }): Promise<Hit[]> {
  const answer = (await c.call('plugins.call', {
    name: '@mosetta/ide-plugin-search',
    method: 'search',
    params,
  })) as { hits: Hit[]; total: number };
  return answer.hits;
}

describe('RAM FS', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await withServer();
    root = await makeProject('ram', {
      'src/main.ts': 'const a = 1;\n',
      'src/util/helper.ts': 'export const h = 1;\n',
      'readme.md': '# hi\n',
    });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('the tree was walked greedily when the project opened', async () => {
    const stats = await c.call('tree.stats', null);
    expect(stats.files).toBe(3);
    expect(stats.dirs).toBe(3);   });

  it('tree.list reads memory, fs.list reads disk — and it shows', async () => {
    await fs.writeFile(path.join(root, 'src', 'sneaky.ts'), 'export const s = 1;\n', 'utf8');

    const fromDisk = await c.call('fs.list', { path: 'src' });
    const fromMemory = await c.call('tree.list', { path: 'src' });

    expect(fromDisk.map((e) => e.name)).toContain('sneaky.ts');
    expect(fromMemory.map((e) => e.name)).not.toContain('sneaky.ts');
  });

  it('node_modules is shown but not walked greedily', async () => {
    await fs.mkdir(path.join(root, 'node_modules', 'left-pad'), { recursive: true });
    await fs.writeFile(path.join(root, 'node_modules', 'left-pad', 'index.js'), 'x\n', 'utf8');

    const fresh = await withServer();
    const cc = await connect(fresh);
    await cc.call('workspace.open', { root });

    const top = await cc.call('tree.list', { path: '' });
    const nm = top.find((e) => e.name === 'node_modules');
    expect(nm?.noScan).toBe(true);

    const stats = await cc.call('tree.stats', null);
    expect(stats.files).toBe(3);

    const inside = await cc.call('tree.list', { path: 'node_modules' });
    expect(inside.map((e) => e.name)).toEqual(['left-pad']);

    await cc.close();
    await fresh.close();
  });

  it('an edit lives in memory and does not leak to disk', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    expect(doc.version).toBe(0);
    expect(doc.dirty).toBe(false);

    const edited = await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'const a = 2;\n',
      baseVersion: doc.version,
    });
    expect(edited.version).toBe(1);
    expect(edited.dirty).toBe(true);

    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('const a = 1;\n');

    await c.call('doc.save', { path: 'src/main.ts' });
    expect(await fs.readFile(path.join(root, 'src/main.ts'), 'utf8')).toBe('const a = 2;\n');
  });

  it('what is unsaved is listed as paths — including what the tab has closed', async () => {
    expect((await c.call('doc.unsaved', null)).paths).toEqual([]);

    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', { path: 'src/main.ts', text: 'const a = 2;\n', baseVersion: doc.version });
    expect((await c.call('doc.unsaved', null)).paths).toEqual(['src/main.ts']);

    await c.call('doc.close', { path: 'src/main.ts' });
    expect((await c.call('doc.unsaved', null)).paths).toEqual(['src/main.ts']);

    await c.call('doc.save', { path: 'src/main.ts' });
    expect((await c.call('doc.unsaved', null)).paths).toEqual([]);
  });

  it('an edit against an outdated version is rejected', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', { path: 'src/main.ts', text: 'x\n', baseVersion: doc.version });

    const err = await c.expectError('doc.edit', {
      path: 'src/main.ts',
      text: 'y\n',
      baseVersion: doc.version,
    });
    expect(err.code).toBe(1009);
  });

  it('somebody else\'s write is picked up while memory is clean', async () => {
    await c.call('doc.open', { path: 'src/main.ts' });
    const waiting = c.nextEvent('doc.external');

    await c.call('fs.write', { path: 'src/main.ts', text: 'external\n', expectedRevision: null });

    await waiting;
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    expect(doc.text).toBe('external\n');
    expect(doc.dirty).toBe(false);
  });

  it('somebody else\'s write over unsaved work is a divergence rather than a silent loss', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', { path: 'src/main.ts', text: 'ours\n', baseVersion: doc.version });

    const waiting = c.nextEvent('doc.diverged');
    await c.call('fs.write', { path: 'src/main.ts', text: 'theirs\n', expectedRevision: null });
    await waiting;

    const after = await c.call('doc.open', { path: 'src/main.ts' });
    expect(after.text).toBe('ours\n');
    expect(after.dirty).toBe(true);

    expect(after.diverged).toBe('changed');

    const reloaded = await c.call('doc.reload', { path: 'src/main.ts' });
    expect(reloaded.text).toBe('theirs\n');
    expect(reloaded.dirty).toBe(false);
    expect(reloaded.diverged, 'the argument ended — and the mark goes out').toBeUndefined();
  });

  it('the index searches memory', async () => {
    const hits = await search(c, { query: 'helper' });
    expect(hits[0]?.path).toBe('src/util/helper.ts');

    const fuzzy = await search(c, { query: 'srmn' });
    expect(fuzzy.map((h) => h.path)).toContain('src/main.ts');
  });
});

describe('the "changed" flag tells the truth', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await withServer();
    root = await makeProject('dirty', { 'a.ts': 'const a = 1;\n' });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('the text was put back as it was — the mark goes out, although there were edits', async () => {
    const doc = await c.call('doc.open', { path: 'a.ts' });

    const changed = await c.call('doc.edit', {
      path: 'a.ts',
      text: 'const a = 2;\n',
      baseVersion: doc.version,
    });
    expect(changed.dirty).toBe(true);

    const back = await c.call('doc.edit', {
      path: 'a.ts',
      text: 'const a = 1;\n',
      baseVersion: changed.version,
    });
    expect(back.dirty).toBe(false);
    expect(back.version).toBe(2);   });
});

describe('a binary is recognised by its contents', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  async function grep(query: string): Promise<Array<{ path: string }>> {
    const answer = (await c.call('plugins.call', {
      name: '@mosetta/ide-plugin-find',
      method: 'grep',
      params: { query, regex: false, caseSensitive: false, words: false, masks: [] },
    })) as { hits: Array<{ path: string }> };
    return answer.hits;
  }

  beforeEach(async () => {
    server = await withServer();
    root = await makeProject('binary', {
      '.gitignore': 'node_modules/\nneedle\n',
      Dockerfile: 'FROM node\n# needle\n',
      'script.py': 'print("needle")\n',
      'notes.md': 'a needle in the text\n',
    });
    await fs.writeFile(path.join(root, 'picture.png'), Buffer.from([0x89, 0x50, 0x00, 0x69, 0x67]));
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('files without a familiar extension are searched like everything else', async () => {
    const found = (await grep('needle')).map((h) => h.path).sort();
    expect(found).toEqual(['.gitignore', 'Dockerfile', 'notes.md', 'script.py']);
  });

  it('a binary does not reach the results and does not pretend to be rubbish', async () => {
    const found = (await grep('ig')).map((h) => h.path);
    expect(found).not.toContain('picture.png');
  });

  it('the tree shows everything, binaries included', async () => {
    const entries = (await c.call('tree.list', { path: '' })) as Array<{ path: string }>;
    expect(entries.map((e) => e.path)).toContain('picture.png');
  });
});

describe('a directory leaves the walk by a setting', () => {
  let server: RunningServer;
  let configDir: string;
  let root: string;
  let c: TestClient;

  async function entriesOf(dir: string): Promise<Array<{ name: string; noScan?: boolean }>> {
    return (await c.call('tree.list', { path: dir })) as Array<{ name: string; noScan?: boolean }>;
  }

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-noscan-'));
    await fs.writeFile(path.join(configDir, 'settings.json'), '{\n  "fs": { "noScan": [] }\n}\n', 'utf8');
    server = await withServer(60_000, configDir);
    root = await makeProject('noscan', {
      'desktop/.build/main.cjs': 'module.exports = 1;\n',
      'src/a.ts': 'const a = 1;\n',
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

  it('at first the directory is ordinary and its contents are in memory', async () => {
    const before = await entriesOf('desktop');
    expect(before.find((e) => e.name === '.build')?.noScan ?? false).toBe(false);
    const stats = await c.call('tree.stats', null);
    expect(stats.files).toBe(2);
  });

  it('added to noScan — the directory is marked, and its insides have left memory', async () => {
    await c.call('config.set', { section: 'fs', key: 'noScan', value: ['.build'] });
    await waitFor(
      async () => (await c.call('tree.stats', null)).files === 1,
      'the tree was rebuilt without .build\'s contents',
    );

    const after = await entriesOf('desktop');
    expect(after.find((e) => e.name === '.build')?.noScan, 'the directory is marked').toBe(true);
  });
});
