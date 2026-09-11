import { describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '@mosetta/ide-plugin-doc';
import MergePlugin, { type MergeSession } from '../src/client.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

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
  host.add(UiPlugin, '@mosetta/ide-plugin-ui');
  (globalThis as Record<string, unknown>)['document'] ??= {};
  host.add(DocPlugin, '@mosetta/ide-plugin-doc');
  const plugin = host.add(MergePlugin, '@mosetta/ide-plugin-merge');
  host.ide('@mosetta/ide-plugin-merge').answers.set('state', () => null);
  await host.start();
  return { host, plugin };
}

describe('экран слияния', () => {
  it('просьба ядра открывает экран, когда сеанс уже есть', async () => {
    const { host, plugin } = await raise();
    host.ide('@mosetta/ide-plugin-merge').emit('state', session(['a.ts', 'b.ts']));
    expect(plugin.merge.open.value).toBe(false);

    host.plugin(DocPlugin).doc.requestMerge('b.ts');
    expect(plugin.merge.open.value).toBe(true);
    expect(plugin.merge.file.value?.path).toBe('b.ts');
  });

  it('просьба, пришедшая РАНЬШЕ сеанса, ждёт его и открывается сама', async () => {
    const { host, plugin } = await raise();
    host.plugin(DocPlugin).doc.requestMerge('a.ts');
    expect(plugin.merge.open.value).toBe(false);

    host.ide('@mosetta/ide-plugin-merge').emit('state', session(['a.ts']));
    expect(plugin.merge.open.value).toBe(true);
    expect(plugin.merge.file.value?.path).toBe('a.ts');
  });

  it('сеанс сам по себе экран НЕ открывает', async () => {
    const { host, plugin } = await raise();
    host.ide('@mosetta/ide-plugin-merge').emit('state', session(['a.ts']));
    expect(plugin.merge.open.value).toBe(false);
  });

  it('кнопка в тулбаре видна ровно тогда, когда есть неразобранное', async () => {
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

  it('клавиша, открывшая экран, его и закрывает', async () => {
    const { host, plugin } = await raise();
    host.ide('@mosetta/ide-plugin-merge').emit('state', session(['a.ts']));
    host.run('merge.show');
    expect(plugin.merge.open.value).toBe(true);
    host.run('merge.show');
    expect(plugin.merge.open.value).toBe(false);
  });
});
