import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import { RpcErrorCode } from '@mosetta/ide-protocol';
import DocPlugin from '../src/client.js';

const NAME = '@mosetta/ide-plugin-doc';
const PROJECT = { id: 'p1', root: '/один', name: 'один' } as never;
const OTHER = { id: 'p2', root: '/два', name: 'два' } as never;

let host: FakeHost;
let plugin: DocPlugin;

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  (globalThis as Record<string, unknown>)['document'] ??= {};
  host = new FakeHost();
  plugin = host.add(DocPlugin, NAME);
  host.surface.docs.texts.set('a.ts', 'раз');
  host.surface.docs.texts.set('b.ts', 'два');
  await host.start();
  host.surface.workspaceCurrent.value = PROJECT;
  host.surface.project.value = PROJECT;
  await settle();
});

describe('документ', () => {
  it('открывает по проводу и закрывает предыдущий', async () => {
    await plugin.openFile('a.ts');
    expect(plugin.openDoc.value?.text).toBe('раз');
    await plugin.openFile('b.ts');
    expect(host.surface.docs.closed).toEqual(['a.ts']);
    expect(plugin.openDoc.value?.path).toBe('b.ts');
  });

  it('правка едет на сервер после паузы, а грязь видна сразу', async () => {
    await plugin.openFile('a.ts');
    plugin.editDoc('раз-два');
    expect(plugin.dirty.value).toBe(true);
    expect(host.surface.docs.edits).toEqual([]);
    await plugin.doc.sync.flush();
    expect(host.surface.docs.edits).toEqual([{ path: 'a.ts', text: 'раз-два' }]);
  });

  it('goTo открывает чужой файл и просит каретку; в своём — только просит', async () => {
    await plugin.goTo('a.ts', 7, 2);
    expect(plugin.openDoc.value?.path).toBe('a.ts');
    expect(plugin.pendingReveal.value).toMatchObject({ path: 'a.ts', line: 7, character: 2, epoch: 1 });
    await plugin.goTo('a.ts', 9);
    expect(host.surface.docs.opened).toEqual(['a.ts']);
    expect(plugin.pendingReveal.value).toMatchObject({ line: 9, epoch: 2 });
  });

  it('Cmd+S упёрся в диск — просит показать спор, а не жалуется', async () => {
    await plugin.openFile('a.ts');
    const asked: string[] = [];
    plugin.doc.onMergeRequested((path) => asked.push(path));
    host.surface.docs.saveFails = { code: RpcErrorCode.RevisionConflict, message: 'диск ушёл' };
    host.run('file.save');
    await settle();
    expect(asked).toEqual(['a.ts']);
    expect(host.ide(NAME).complaints).toEqual([]);
  });

  it('файл исчез — возвращаемся к предыдущему', async () => {
    await plugin.openFile('a.ts');
    await plugin.openFile('b.ts');
    host.surface.docs.fireRemoved({ path: 'b.ts' });
    await settle();
    expect(plugin.openDoc.value?.path).toBe('a.ts');
    expect(host.ide(NAME).complaints.at(-1)).toContain('file.gone');
  });

  it('прикрепление открывает то, что помнила вкладка; смена проекта — обнуляет', async () => {
    await plugin.openFile('a.ts');
    host.surface.project.value = null;
    host.surface.project.value = PROJECT;
    await settle();
    expect(host.surface.docs.opened).toEqual(['a.ts', 'a.ts']);
    expect(plugin.openDoc.value?.path).toBe('a.ts');

    host.surface.workspaceCurrent.value = OTHER;
    host.surface.project.value = OTHER;
    await settle();
    expect(plugin.openDoc.value).toBeNull();
  });

  it('внешняя правка обновляет открытый файл и говорит об этом, ожидаемая — молчит', async () => {
    await plugin.openFile('a.ts');
    host.surface.docs.texts.set('a.ts', 'снаружи');
    host.surface.docs.fireExternal({ path: 'a.ts', revision: 'r2' });
    await settle();
    expect(plugin.openDoc.value?.text).toBe('снаружи');
    expect(host.ide(NAME).said.at(-1)).toContain('file.external');
    plugin.doc.expectExternal('a.ts');
    host.surface.docs.fireExternal({ path: 'a.ts', revision: 'r3' });
    await settle();
    expect(host.ide(NAME).said.filter((one) => one.includes('file.external'))).toHaveLength(1);
  });

  it('чужая вкладка правила тот же файл — берём текст сервера, свою версию не выдумываем', async () => {
    await plugin.openFile('a.ts');
    const epoch = plugin.externalEpoch.value;
    host.surface.docs.fireChanged({ path: 'a.ts', version: plugin.openDoc.value!.version, dirty: false });
    await settle();
    expect(plugin.externalEpoch.value).toBe(epoch);
    host.surface.docs.texts.set('a.ts', 'из соседней вкладки');
    host.surface.docs.fireChanged({ path: 'a.ts', version: plugin.openDoc.value!.version + 1, dirty: true });
    await settle();
    expect(plugin.openDoc.value?.text).toBe('из соседней вкладки');
    expect(plugin.externalEpoch.value).toBe(epoch + 1);
  });

  it('устаревшая версия при отправке — тоже подтягиваем сервер, а не жалуемся', async () => {
    await plugin.openFile('a.ts');
    const epoch = plugin.externalEpoch.value;
    host.surface.docs.editFails = { code: RpcErrorCode.StaleVersion, message: 'stale' };
    host.surface.docs.texts.set('a.ts', 'сервер знает лучше');
    plugin.editDoc('моё');
    await plugin.doc.sync.flush();
    await settle();
    expect(plugin.openDoc.value?.text).toBe('сервер знает лучше');
    expect(plugin.externalEpoch.value).toBe(epoch + 1);
    expect(host.ide(NAME).complaints).toEqual([]);
  });

  it('номер открытия растёт на другом файле и не растёт на переезде того же', async () => {
    await plugin.openFile('a.ts');
    const epoch = plugin.openEpoch.value;
    host.surface.docs.texts.set('c.ts', 'раз');
    host.surface.docs.fireMoved({ from: 'a.ts', path: 'c.ts' });
    await settle();
    expect(plugin.openDoc.value?.path).toBe('c.ts');
    expect(plugin.openEpoch.value).toBe(epoch);
    await plugin.openFile('b.ts');
    expect(plugin.openEpoch.value).toBe(epoch + 1);
  });
});

describe('файл, открытый не документом', () => {
  function shows(prefix: string, text: boolean): void {
    host.registry.add(
      'file.view',
      { id: prefix, opens: (path: string) => path.endsWith(prefix), text, view: () => null },
      '@mosetta/ide-plugin-image',
    );
  }

  it('показ без текста: документ не открываем вовсе', async () => {
    shows('.png', false);
    await plugin.openFile('logo.png');
    expect(plugin.viewedFile.value).toBe('logo.png');
    expect(plugin.openDoc.value).toBeNull();
    expect(host.surface.docs.opened).not.toContain('logo.png');
  });

  it('показ, которому текст нужен, открывает документ как обычно', async () => {
    shows('.ts', true);
    await plugin.openFile('a.ts');
    expect(plugin.openDoc.value?.path).toBe('a.ts');
    expect(plugin.viewedFile.value).toBeNull();
  });

  it('документ и показ гасят друг друга: место одно', async () => {
    shows('.png', false);
    await plugin.openFile('a.ts');
    await plugin.openFile('logo.png');
    expect(plugin.openDoc.value).toBeNull();
    expect(plugin.viewedFile.value).toBe('logo.png');

    await plugin.openFile('a.ts');
    expect(plugin.viewedFile.value).toBeNull();
    expect(plugin.openDoc.value?.path).toBe('a.ts');
  });

  it('закрыть можно и то, что документом не было', async () => {
    shows('.png', false);
    await plugin.openFile('logo.png');
    await plugin.closeFile();
    expect(plugin.viewedFile.value).toBeNull();
  });

  it('живой текст — это правка, а не то, что успел подтвердить сервер', async () => {
    await plugin.openFile('a.ts');
    expect(plugin.liveText.value).toBe('раз');
    plugin.editDoc('раз-два');
    expect(plugin.liveText.value).toBe('раз-два');
  });
});
