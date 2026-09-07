import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@ide/api/testing';
import { RpcErrorCode } from '@ide/protocol';
import DocPlugin, {
  dirty,
  editDoc,
  externalEpoch,
  goTo,
  openDoc,
  openEpoch,
  openFile,
  pendingReveal,
} from '../src/client.js';

const NAME = '@ide/plugin-doc';
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
    await openFile('a.ts');
    expect(openDoc.value?.text).toBe('раз');
    await openFile('b.ts');
    expect(host.surface.docs.closed).toEqual(['a.ts']);
    expect(openDoc.value?.path).toBe('b.ts');
  });

  it('правка едет на сервер после паузы, а грязь видна сразу', async () => {
    await openFile('a.ts');
    editDoc('раз-два');
    expect(dirty.value).toBe(true);
    expect(host.surface.docs.edits).toEqual([]);
    await plugin.doc.sync.flush();
    expect(host.surface.docs.edits).toEqual([{ path: 'a.ts', text: 'раз-два' }]);
  });

  it('goTo открывает чужой файл и просит каретку; в своём — только просит', async () => {
    await goTo('a.ts', 7, 2);
    expect(openDoc.value?.path).toBe('a.ts');
    expect(pendingReveal.value).toMatchObject({ path: 'a.ts', line: 7, character: 2, epoch: 1 });
    await goTo('a.ts', 9);
    expect(host.surface.docs.opened).toEqual(['a.ts']);
    expect(pendingReveal.value).toMatchObject({ line: 9, epoch: 2 });
  });

  it('Cmd+S упёрся в диск — просит показать спор, а не жалуется', async () => {
    await openFile('a.ts');
    const asked: string[] = [];
    plugin.doc.onMergeRequested((path) => asked.push(path));
    host.surface.docs.saveFails = { code: RpcErrorCode.RevisionConflict, message: 'диск ушёл' };
    host.run('file.save');
    await settle();
    expect(asked).toEqual(['a.ts']);
    expect(host.ide(NAME).complaints).toEqual([]);
  });

  it('файл исчез — возвращаемся к предыдущему', async () => {
    await openFile('a.ts');
    await openFile('b.ts');
    host.surface.docs.fireRemoved({ path: 'b.ts' });
    await settle();
    expect(openDoc.value?.path).toBe('a.ts');
    expect(host.ide(NAME).complaints.at(-1)).toContain('file.gone');
  });

  it('прикрепление открывает то, что помнила вкладка; смена проекта — обнуляет', async () => {
    await openFile('a.ts');
    host.surface.project.value = null;
    host.surface.project.value = PROJECT;
    await settle();
    expect(host.surface.docs.opened).toEqual(['a.ts', 'a.ts']);
    expect(openDoc.value?.path).toBe('a.ts');

    host.surface.workspaceCurrent.value = OTHER;
    host.surface.project.value = OTHER;
    await settle();
    expect(openDoc.value).toBeNull();
  });

  it('внешняя правка обновляет открытый файл и говорит об этом, ожидаемая — молчит', async () => {
    await openFile('a.ts');
    host.surface.docs.texts.set('a.ts', 'снаружи');
    host.surface.docs.fireExternal({ path: 'a.ts', revision: 'r2' });
    await settle();
    expect(openDoc.value?.text).toBe('снаружи');
    expect(host.ide(NAME).said.at(-1)).toContain('file.external');
    plugin.doc.expectExternal('a.ts');
    host.surface.docs.fireExternal({ path: 'a.ts', revision: 'r3' });
    await settle();
    expect(host.ide(NAME).said.filter((one) => one.includes('file.external'))).toHaveLength(1);
  });

  it('чужая вкладка правила тот же файл — берём текст сервера, свою версию не выдумываем', async () => {
    await openFile('a.ts');
    const epoch = externalEpoch.value;
    host.surface.docs.fireChanged({ path: 'a.ts', version: openDoc.value!.version, dirty: false });
    await settle();
    expect(externalEpoch.value).toBe(epoch);
    host.surface.docs.texts.set('a.ts', 'из соседней вкладки');
    host.surface.docs.fireChanged({ path: 'a.ts', version: openDoc.value!.version + 1, dirty: true });
    await settle();
    expect(openDoc.value?.text).toBe('из соседней вкладки');
    expect(externalEpoch.value).toBe(epoch + 1);
  });

  it('устаревшая версия при отправке — тоже подтягиваем сервер, а не жалуемся', async () => {
    await openFile('a.ts');
    const epoch = externalEpoch.value;
    host.surface.docs.editFails = { code: RpcErrorCode.StaleVersion, message: 'stale' };
    host.surface.docs.texts.set('a.ts', 'сервер знает лучше');
    editDoc('моё');
    await plugin.doc.sync.flush();
    await settle();
    expect(openDoc.value?.text).toBe('сервер знает лучше');
    expect(externalEpoch.value).toBe(epoch + 1);
    expect(host.ide(NAME).complaints).toEqual([]);
  });

  it('номер открытия растёт на другом файле и не растёт на переезде того же', async () => {
    await openFile('a.ts');
    const epoch = openEpoch.value;
    host.surface.docs.texts.set('c.ts', 'раз');
    host.surface.docs.fireMoved({ from: 'a.ts', path: 'c.ts' });
    await settle();
    expect(openDoc.value?.path).toBe('c.ts');
    expect(openEpoch.value).toBe(epoch);
    await openFile('b.ts');
    expect(openEpoch.value).toBe(epoch + 1);
  });
});
