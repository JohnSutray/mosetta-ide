import { describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '@mosetta/ide-plugin-doc';
import MergePlugin, { type MergeSession } from '../src/client.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * The merge screen as a plugin: what it promises the core.
 *
 * The core does not call the plugin — it ASKS for the argument about a file to be
 * shown, while the session arrives by its own route and may be late. The toolbar button
 * appears only when there is something to settle. Both things used to be checked by eye
 * and never by a test.
 */
function session(paths: string[], done: string[] = []): MergeSession {
  return {
    id: 'a session',
    source: 'fs',
    title: 'merge.title.fs.save',
    files: paths.map((path) => ({
      path,
      base: '',
      left: { label: 'merge.side.editor', text: 'mine' },
      right: { label: 'merge.side.disk', text: 'theirs' },
      done: done.includes(path),
    })),
  };
}

async function raise() {
  const host = new FakeHost();
  host.add(UiPlugin, '@mosetta/ide-plugin-ui');
  (globalThis as Record<string, unknown>)['document'] ??= {};
  host.add(DocPlugin, '@mosetta/ide-plugin-doc');
  const plugin = host.add(MergePlugin, '@mosetta/ide-plugin-merge');
  host.ide('@mosetta/ide-plugin-merge').answers.set('state', () => null);
  await host.start();
  return { host, plugin };
}

describe('the merge screen', () => {
  it('the core\'s request opens the screen when the session already exists', async () => {
    const { host, plugin } = await raise();
    host.ide('@mosetta/ide-plugin-merge').emit('state', session(['a.ts', 'b.ts']));
    expect(plugin.merge.open.value).toBe(false);

    host.plugin(DocPlugin).doc.requestMerge('b.ts');
    expect(plugin.merge.open.value).toBe(true);
    expect(plugin.merge.file.value?.path).toBe('b.ts');
  });

  it('a request that arrived BEFORE the session waits for it and opens by itself', async () => {
    const { host, plugin } = await raise();
    host.plugin(DocPlugin).doc.requestMerge('a.ts');
    expect(plugin.merge.open.value).toBe(false);

    host.ide('@mosetta/ide-plugin-merge').emit('state', session(['a.ts']));
    expect(plugin.merge.open.value).toBe(true);
    expect(plugin.merge.file.value?.path).toBe('a.ts');
  });

  it('a session by itself does NOT open the screen', async () => {
    const { host, plugin } = await raise();
    host.ide('@mosetta/ide-plugin-merge').emit('state', session(['a.ts']));
    expect(plugin.merge.open.value).toBe(false);
  });

  it('the toolbar button is visible exactly when there is something unsettled', async () => {
    const { host, plugin } = await raise();
    const [button] = host.ide('@mosetta/ide-plugin-merge').registry<{
      id: string;
      visible: { value: boolean };
      badge: { value: number };
    }>('toolbar.button').all.value;
    expect(button?.id).toBe('merge');
    expect(button!.visible.value).toBe(false);

    host.ide('@mosetta/ide-plugin-merge').emit('state', session(['a.ts', 'b.ts'], ['a.ts']));
    expect(button!.visible.value).toBe(true);
    expect(button!.badge.value).toBe(1);

    host.ide('@mosetta/ide-plugin-merge').emit('state', null);
    expect(button!.visible.value).toBe(false);
    expect(plugin.merge.open.value).toBe(false);
  });

  it('the key that opened the screen closes it', async () => {
    const { host, plugin } = await raise();
    host.ide('@mosetta/ide-plugin-merge').emit('state', session(['a.ts']));
    host.run('merge.show');
    expect(plugin.merge.open.value).toBe(true);
    host.run('merge.show');
    expect(plugin.merge.open.value).toBe(false);
  });
});
