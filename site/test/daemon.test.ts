import { describe, expect, it } from 'vitest';
import { DemoDaemon, type Snapshot } from '../src/demo/daemon.js';

/**
 * The daemon the website plays. The client cannot tell it from a real one, so what it
 * answers has to hold together: a save shows up in git, a search finds what the files
 * say, and whatever needs a machine refuses in words.
 */
const SNAPSHOT = {
  config: { settings: {}, sources: [], user: {}, defaults: {}, project: {}, projectFile: null },
  plugins: [],
  code: {},
} as unknown as Snapshot;

function daemon(): { daemon: DemoDaemon; events: Array<{ method: string; params: any }> } {
  const events: Array<{ method: string; params: any }> = [];
  return { daemon: new DemoDaemon(SNAPSHOT, (method, params) => events.push({ method, params })), events };
}

const call = (d: DemoDaemon, name: string, method: string, params: unknown = null) =>
  d.handle('plugins.call', { name: `@mosetta/ide-plugin-${name}`, method, params }) as Promise<any>;

describe('the demo daemon', () => {
  it('attaches a new tab to the demo project, with the config first', () => {
    const { daemon: d, events } = daemon();
    d.connected();
    expect(events.map((one) => one.method)).toEqual(['config.changed', 'workspace.list', 'workspace.attached']);
  });

  it('shows a changed working tree, and a save moves git', async () => {
    const { daemon: d, events } = daemon();
    const before = await call(d, 'git', 'state');
    expect(before.files).toMatchObject({ 'src/flock.ts': 'modified', 'docs/herding.md': 'untracked' });
    expect(before.files['src/sheep.ts']).toBeUndefined();

    await d.handle('doc.edit', { path: 'src/sheep.ts', text: 'changed\n', baseVersion: 1 });
    await d.handle('doc.save', { path: 'src/sheep.ts' });
    expect((await call(d, 'git', 'state')).files['src/sheep.ts']).toBe('modified');
    expect(events.some((one) => one.method === 'plugins.event' && one.params.event === 'state')).toBe(true);
  });

  it('searches with the real index and greps with the real engine', async () => {
    const { daemon: d } = daemon();
    const found = await call(d, 'search', 'search', { query: 'flock', limit: 10 });
    expect(found.hits.map((hit: { label: string }) => hit.label)).toContain('src/flock.ts');
    const grep = await call(d, 'find', 'grep', { query: 'hunger', regex: false, caseSensitive: true, words: false, masks: [], excludes: [] });
    expect(grep.files).toBeGreaterThan(0);
  });

  it('settles a file that diverged from disk on the merge screen', async () => {
    const { daemon: d } = daemon();
    await d.handle('doc.edit', { path: 'src/sheep.ts', text: 'mine\n', baseVersion: 1 });
    d.diverge('src/sheep.ts', 'theirs\n');
    expect(((await d.handle('doc.state', { path: 'src/sheep.ts' })) as any).diverged).toBe('changed');
    const session = await call(d, 'merge', 'fromDisk', { path: 'src/sheep.ts' });
    expect(session.files[0]).toMatchObject({ left: { text: 'mine\n' }, right: { text: 'theirs\n' } });
    expect(await call(d, 'merge', 'resolve', { path: 'src/sheep.ts', text: 'both\n' })).toBeNull();
    expect(((await d.handle('doc.state', { path: 'src/sheep.ts' })) as any).text).toBe('both\n');
  });

  it('says in words what needs a machine', async () => {
    const { daemon: d } = daemon();
    await expect(call(d, 'debug', 'launch', { program: 'x.js' })).rejects.toThrow(/real machine/);
    await expect(call(d, 'lsp', 'nothing')).rejects.toThrow(/real machine/);
  });
});
