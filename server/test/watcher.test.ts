import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, type TestClient, waitFor, withServer } from './helpers.js';

/** The index is a plugin: we go through the plugin door. */
interface Hit {
  kind: string;
  label: string;
  path: string;
  line?: number;
  matches: number[];
}
/** Hits. The index hands them over together with the number found up to the ceiling. */
async function search(c: TestClient, params: { query: string; limit?: number; kinds?: string[] }): Promise<Hit[]> {
  const answer = (await c.call('plugins.call', {
    name: '@mosetta/ide-plugin-search',
    method: 'search',
    params,
  })) as { hits: Hit[]; total: number };
  return answer.hits;
}

/**
 * The watcher is the only place where memory catches up with disk by itself.
 *
 * What is checked is not "an event arrives" but the decisions memory takes: a clean
 * document is pulled in, a dirty one yields a conflict, node_modules is ignored, and
 * our own write does not count as somebody else's.
 */

const CONFIG = fileURLToPath(new URL('./fixtures/config-watch', import.meta.url));

describe('watching disk', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await withServer(60_000, CONFIG);
    root = await makeProject('watch', {
      'src/main.ts': 'const a = 1;\n',
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

  it('a new file appears in memory by itself', async () => {
    const waiting = treeChanged(c, 'src');
    await fs.writeFile(path.join(root, 'src', 'added.ts'), 'export const x = 1;\n', 'utf8');
    await waiting;

    const tree = await c.call('tree.list', { path: 'src' });
    expect(tree.map((e) => e.name)).toContain('added.ts');
  });

  it('a new file is searchable by the index at once', async () => {
    await fs.writeFile(path.join(root, 'src', 'found.ts'), 'export const y = 1;\n', 'utf8');
    await waitFor(
      async () => (await search(c, { query: 'found' })).some((h) => h.path === 'src/found.ts'),
      'the new file is in the index',
    );
  });

  it('a deleted file leaves memory', async () => {
    const waiting = treeChanged(c, '');
    await fs.rm(path.join(root, 'readme.md'));
    await waiting;

    const names = await until(
      async () => (await c.call('tree.list', { path: '' })).map((e) => e.name),
      (list) => !list.includes('readme.md'),
    );
    expect(names).not.toContain('readme.md');
  });

  it('a new directory is walked whole', async () => {
    const waiting = treeChanged(c, 'src/deep');
    await fs.mkdir(path.join(root, 'src', 'deep', 'nested'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'deep', 'nested', 'far.ts'), 'export {};\n', 'utf8');
    await waiting;
    await settle();

    const hits = await search(c, { query: 'far' });
    expect(hits.map((h) => h.path)).toContain('src/deep/nested/far.ts');
  });

  it('a deleted directory takes its subtree with it', async () => {
    await fs.mkdir(path.join(root, 'src', 'temp'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'temp', 'inner.ts'), 'export {};\n', 'utf8');
    await treeChanged(c, 'src/temp');
    await settle();
    expect((await search(c, { query: 'inner' })).length).toBeGreaterThan(0);

    await fs.rm(path.join(root, 'src', 'temp'), { recursive: true, force: true });
    await treeChanged(c, 'src');
    await settle();

    expect(await search(c, { query: 'inner' })).toEqual([]);
  });

  it('somebody else\'s edit is pulled in while memory is clean', async () => {
    await c.call('doc.open', { path: 'src/main.ts' });
    const waiting = c.nextEvent('doc.external', 5000);

    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'const a = 99;\n', 'utf8');
    await waiting;

    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    expect(doc.text).toBe('const a = 99;\n');
    expect(doc.dirty).toBe(false);
  });

  it('somebody else\'s edit is visible AFTER our own save too', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', { path: 'src/main.ts', text: 'ours\n', baseVersion: doc.version });
    await c.call('doc.save', { path: 'src/main.ts' });
    await settle(300);

    const waiting = c.nextEvent('doc.external', 5000);
    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'theirs after ours\n', 'utf8');
    await waiting;

    expect((await c.call('doc.state', { path: 'src/main.ts' })).text).toBe('theirs after ours\n');
  });

  it('somebody else\'s edit over unsaved work is a divergence rather than a loss', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', { path: 'src/main.ts', text: 'ours\n', baseVersion: doc.version });

    const waiting = c.nextEvent('doc.diverged', 5000);
    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'theirs\n', 'utf8');
    await waiting;

    const after = await c.call('doc.open', { path: 'src/main.ts' });
    expect(after.text).toBe('ours\n');
    expect(after.dirty).toBe(true);
  });

  it('an open document that vanished is announced as deleted', async () => {
    await c.call('doc.open', { path: 'src/main.ts' });
    const waiting = c.nextEvent('doc.removed', 5000);
    await fs.rm(path.join(root, 'src', 'main.ts'));
    expect(await waiting).toMatchObject({ path: 'src/main.ts' });
  });

  it('our own save does not count as somebody else\'s edit', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', { path: 'src/main.ts', text: 'ours\n', baseVersion: doc.version });
    await c.call('doc.save', { path: 'src/main.ts' });
    await settle(300);

    expect(c.events('doc.diverged')).toEqual([]);
    expect(c.events('doc.external')).toEqual([]);
  });

  it('fuss inside node_modules does not disturb memory', async () => {
    await fs.mkdir(path.join(root, 'node_modules', 'left-pad'), { recursive: true });
    await treeChanged(c, '');     await settle();

    const before = c.events('tree.changed').length;
    for (let i = 0; i < 20; i += 1) {
      await fs.writeFile(
        path.join(root, 'node_modules', 'left-pad', `f${i}.js`),
        'module.exports = 1;\n',
        'utf8',
      );
    }
    await settle(300);

    expect(c.events('tree.changed').length).toBe(before);
    expect((await c.call('tree.stats', null)).files).toBe(2);
  });

  it('a file created through fs.create is seen by memory itself', async () => {
    await c.call('fs.create', { path: 'src/fresh.ts', kind: 'file' });
    await treeChanged(c, 'src');
    const tree = await c.call('tree.list', { path: 'src' });
    expect(tree.map((entry) => entry.name)).toContain('fresh.ts');
  }, 15_000);

  it('moving an open file does not kill the document', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'const a = 2;\n',
      baseVersion: doc.version,
    });

    const moved = c.nextEvent('doc.moved');
    await c.call('fs.move', { from: 'src/main.ts', to: 'moved.ts' });
    expect(await moved).toMatchObject({ from: 'src/main.ts', path: 'moved.ts' });

    await settle(300);
    const state = await c.call('doc.state', { path: 'moved.ts' });
    expect(state.text).toContain('a = 2');
    expect(state.dirty).toBe(true);
    expect(c.events('doc.removed')).toEqual([]);
  }, 15_000);

  it('editors\' temporary files do not surface', async () => {
    await fs.writeFile(path.join(root, 'src', '.main.ts.tmp-123-abc'), 'rubbish\n', 'utf8');
    await fs.writeFile(path.join(root, 'src', 'main.ts~'), 'rubbish\n', 'utf8');
    await settle(300);

    const tree = await c.call('tree.list', { path: 'src' });
    expect(tree.map((e) => e.name)).toEqual(['main.ts']);
  });
});

/**
 * Wait for a PARTICULAR directory to update rather than for the first event that turns
 * up.
 */
function treeChanged(client: TestClient, dir: string): Promise<unknown> {
  return client.nextEvent('tree.changed', 5000, (p) => p?.path === dir);
}

/**
 * Wait for the required STATE by polling it.
 *
 * An event says "something changed" rather than "everything that should have changed
 * has". Where the outcome matters, the outcome is what has to be waited for — otherwise
 * the test measures the filesystem's speed, and that differs between operating systems.
 */
async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 8000): Promise<T> {
  const began = Date.now();
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() - began > ms) return value;
    await settle(50);
  }
}

/** Give the watcher time to finish a batch: the parsing pause plus a margin. */
function settle(ms = 150): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
