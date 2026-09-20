import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

/**
 * A merge session, and the rule by which it is born.
 *
 * The main thing checked here is NOT "the method answered" but the semantics: a
 * conflict is an action being refused rather than a state of the world. Disk diverging
 * from memory starts no argument by itself; the argument is started by an attempt to
 * save or to pull in.
 *
 * The session belongs to the merge plugin, so we go through the plugin door: the core
 * lends memory and disk, and the plugin judges the argument.
 */

const MERGE = '@mosetta/ide-plugin-merge';
interface Session {
  source: string;
  title: string;
  files: Array<{ path: string; base: string | null; left: { text: string | null }; right: { text: string | null } }>;
}
function merge(c: TestClient, method: string, params: unknown = null): Promise<Session | null> {
  return c.call('plugins.call', { name: MERGE, method, params }) as Promise<Session | null>;
}
/** The session arrived as a plugin event; `match` says what we are waiting for. */
async function nextState(c: TestClient, match: (state: Session | null) => boolean): Promise<Session> {
  const event = (await c.nextEvent('plugins.event', 8000, (e) => e.name === MERGE && e.event === 'state' && match(e.payload))) as {
    payload: Session;
  };
  return event.payload;
}

const CONFIG = fileURLToPath(new URL('./fixtures/config-watch', import.meta.url));

describe('merging', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  /** Drive memory and disk apart: our edits here, somebody else's there. */
  async function diverge(text = 'one\ntwo\nTHREE\n'): Promise<void> {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'ONE\ntwo\nthree\n',
      baseVersion: doc.version,
    });
    const waiting = c.nextEvent('doc.diverged', 8000);
    await fs.writeFile(path.join(root, 'src', 'main.ts'), text, 'utf8');
    await waiting;
  }

  beforeEach(async () => {
    server = await withServer(60_000, CONFIG);
    root = await makeProject('merge', { 'src/main.ts': 'one\ntwo\nthree\n' });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('no conflicts — and no session', async () => {
    expect(await merge(c, 'state')).toBeNull();
  });

  it('a DIVERGENCE starts no argument: nobody is blocked by anything', async () => {
    await diverge();
    expect(await merge(c, 'state')).toBeNull();
    const state = await c.call('doc.state', { path: 'src/main.ts' });
    expect(state.text).toBe('ONE\ntwo\nthree\n');
    expect(state.dirty).toBe(true);
  });

  it('the argument is started by a REFUSED SAVE, and the ancestor in it is the real one', async () => {
    await diverge();

    const waiting = nextState(c, (state) => state !== null);
    await c.expectError('doc.save', { path: 'src/main.ts' });
    const state = await waiting;

    expect(state.source).toBe('fs');
    expect(state.title).toBe('merge.title.fs.save');
    const file = state.files[0]!;
    expect(file.base).toBe('one\ntwo\nthree\n');
    expect(file.left.text).toBe('ONE\ntwo\nthree\n');
    expect(file.right.text).toBe('one\ntwo\nTHREE\n');
  });

  it('settling an argument about saving goes TO DISK', async () => {
    await diverge();
    await c.expectError('doc.save', { path: 'src/main.ts' });
    await nextState(c, (state) => state !== null);

    const merged = 'ONE\ntwo\nTHREE\n';
    expect(await merge(c, 'resolve', { path: 'src/main.ts', text: merged })).toBeNull();

    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe(merged);
    const state = await c.call('doc.state', { path: 'src/main.ts' });
    expect(state.text).toBe(merged);
    expect(state.dirty).toBe(false);
  });

  it('settling an argument about reloading stays IN MEMORY', async () => {
    await diverge();

    const session = await merge(c, 'fromDisk', { path: 'src/main.ts' });
    expect(session?.title).toBe('merge.title.fs.reload');

    const merged = 'ONE\ntwo\nTHREE\n';
    await merge(c, 'resolve', { path: 'src/main.ts', text: merged });

    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe('one\ntwo\nTHREE\n');
    const state = await c.call('doc.state', { path: 'src/main.ts' });
    expect(state.text).toBe(merged);
    expect(state.dirty).toBe(true);
  });

  it('merging catches the revision up: the next save goes through', async () => {
    await diverge();
    await merge(c, 'fromDisk', { path: 'src/main.ts' });
    await merge(c, 'resolve', { path: 'src/main.ts', text: 'ONE\ntwo\nTHREE\n' });

    const saved = await c.call('doc.save', { path: 'src/main.ts' });
    expect(saved.dirty).toBe(false);
    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe('ONE\ntwo\nTHREE\n');
  });

  it('the file was deleted from outside — the edits are alive, but there is no argument yet', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'my work\n',
      baseVersion: doc.version,
    });

    const waiting = c.nextEvent('doc.diverged', 8000, (e) => e.reason === 'removed');
    await fs.rm(path.join(root, 'src', 'main.ts'));
    await waiting;

    expect((await c.call('doc.state', { path: 'src/main.ts' })).text).toBe('my work\n');
    expect(await merge(c, 'state')).toBeNull();
  });

  it('saving over a deleted file asks EXPLICITLY rather than resurrecting it silently', async () => {
    const doc = await c.call('doc.open', { path: 'src/main.ts' });
    await c.call('doc.edit', {
      path: 'src/main.ts',
      text: 'my work\n',
      baseVersion: doc.version,
    });
    const gone = c.nextEvent('doc.diverged', 8000, (e) => e.reason === 'removed');
    await fs.rm(path.join(root, 'src', 'main.ts'));
    await gone;

    const waiting = nextState(c, (state) => state !== null);
    await c.expectError('doc.save', { path: 'src/main.ts' });
    const state = await waiting;

    expect(state.files[0]!.right.text).toBeNull();
    expect(state.files[0]!.left.text).toBe('my work\n');
  });

  it('a refusal closes the session and writes nothing', async () => {
    await diverge('somebody else\'s\n');
    await c.expectError('doc.save', { path: 'src/main.ts' });
    await nextState(c, (state) => state !== null);

    await merge(c, 'cancel');
    expect(await merge(c, 'state')).toBeNull();
    expect(await fs.readFile(path.join(root, 'src', 'main.ts'), 'utf8')).toBe('somebody else\'s\n');
    expect((await c.call('doc.state', { path: 'src/main.ts' })).text).toBe('ONE\ntwo\nthree\n');
  });
});
