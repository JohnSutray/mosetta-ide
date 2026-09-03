import { describe, expect, it } from 'vitest';
import type { MergeSession } from '@ide/protocol';
import { FakeHost } from '@ide/api/testing';
import MergePlugin from '../src/client.js';

function session(paths: string[], done: string[] = []): MergeSession {
  return {
    id: 'сеанс',
    source: 'fs',
    title: 'merge.title.fs.save',
    files: paths.map((path) => ({
      path,
      base: '',
      left: { label: 'merge.side.editor', text: 'моё' },
      right: { label: 'merge.side.disk', text: 'чужое' },
      done: done.includes(path),
    })),
  };
}

async function raise() {
  const host = new FakeHost();
  const plugin = host.add(MergePlugin, '@ide/plugin-merge');
  await host.start();
  return { host, plugin };
}

describe('экран слияния', () => {
  it('просьба ядра открывает экран, когда сеанс уже есть', async () => {
    const { host, plugin } = await raise();
    host.surface.pushMergeState(session(['a.ts', 'b.ts']));
    expect(plugin.merge.open.value).toBe(false);

    host.surface.requestMerge('b.ts');
    expect(plugin.merge.open.value).toBe(true);
    expect(plugin.merge.file.value?.path).toBe('b.ts');
  });

  it('просьба, пришедшая РАНЬШЕ сеанса, ждёт его и открывается сама', async () => {
    const { host, plugin } = await raise();
    host.surface.requestMerge('a.ts');
    expect(plugin.merge.open.value).toBe(false);

    host.surface.pushMergeState(session(['a.ts']));
    expect(plugin.merge.open.value).toBe(true);
    expect(plugin.merge.file.value?.path).toBe('a.ts');
  });

  it('сеанс сам по себе экран НЕ открывает', async () => {
    const { host, plugin } = await raise();
    host.surface.pushMergeState(session(['a.ts']));
    expect(plugin.merge.open.value).toBe(false);
  });

  it('кнопка в тулбаре видна ровно тогда, когда есть неразобранное', async () => {
    const { host, plugin } = await raise();
    const [button] = host.ide('@ide/plugin-merge').registry<{
      id: string;
      visible: { value: boolean };
      badge: { value: number };
    }>('toolbar.button').all.value;
    expect(button?.id).toBe('merge');
    expect(button!.visible.value).toBe(false);

    host.surface.pushMergeState(session(['a.ts', 'b.ts'], ['a.ts']));
    expect(button!.visible.value).toBe(true);
    expect(button!.badge.value).toBe(1);

    host.surface.pushMergeState(null);
    expect(button!.visible.value).toBe(false);
    expect(plugin.merge.open.value).toBe(false);
  });

  it('клавиша, открывшая экран, его и закрывает', async () => {
    const { host, plugin } = await raise();
    host.surface.pushMergeState(session(['a.ts']));
    host.run('merge.show');
    expect(plugin.merge.open.value).toBe(true);
    host.run('merge.show');
    expect(plugin.merge.open.value).toBe(false);
  });
});
