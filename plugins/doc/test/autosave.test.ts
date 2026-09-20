import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '../src/client.js';

const NAME = '@mosetta/ide-plugin-doc';

describe('автосохранение', () => {
  let host: FakeHost;
  let docs: DocPlugin;

  beforeEach(async () => {
    host = new FakeHost();
    docs = host.add(DocPlugin, NAME);
    host.surface.docs.texts.set('a.ts', 'let x = 1\n');
    host.surface.docs.texts.set('b.ts', 'два');
    await host.start();
    await docs.openFile('a.ts');
    docs.editDoc('let x = 2\n');
  });

  it('заводское — выключено: фокус ушёл, файл остался несохранённым', () => {
    docs.editorLeft();
    expect(host.surface.docs.saved).toEqual([]);
    expect(docs.dirty.value).toBe(true);
    expect(docs.autosaves).toBe(false);
  });

  it('`focusLost` — пишет на диск ровно тогда, когда клавиатура ушла', async () => {
    host.setSettings({ doc: { autosave: 'focusLost' } });
    expect(docs.autosaves).toBe(true);
    docs.editorLeft();
    await new Promise((done) => setTimeout(done, 0));
    expect(host.surface.docs.saved).toEqual(['a.ts']);
    expect(docs.dirty.value).toBe(false);
  });

  it('писать нечего — молчим: уход фокуса не трогает диск сам по себе', async () => {
    host.setSettings({ doc: { autosave: 'focusLost' } });
    docs.editorLeft();
    await new Promise((done) => setTimeout(done, 0));
    host.surface.docs.saved.length = 0;
    docs.editorLeft();
    await new Promise((done) => setTimeout(done, 0));
    expect(host.surface.docs.saved).toEqual([]);
  });

  it('ответ на сохранение не затирает файл, который открыли, пока оно летело', async () => {
    const wire = host.surface.docs;
    let release: () => void = () => undefined;
    const slow = new Promise<void>((done) => (release = done));
    const saveAsIs = wire.save.bind(wire);
    wire.save = async (path: string) => {
      await slow;
      return saveAsIs(path);
    };

    const saving = docs.doc.save();
    await docs.openFile('b.ts');
    release();
    await saving;

    expect(docs.openDoc.value?.path).toBe('b.ts');
    expect(docs.openDoc.value?.text).toBe('два');
    docs.editDoc('два-три');
    await docs.doc.sync.flush();
    expect(wire.edits.at(-1)).toEqual({ path: 'b.ts', text: 'два-три' });
  });

  it('несохранённое считается слоем памяти, а не открытым файлом', async () => {
    host.surface.docs.unsavedPaths.add('b.ts');
    expect(await docs.unsaved()).toEqual(['a.ts', 'b.ts']);
    host.surface.docs.texts.set('b.ts', 'x\n');
    expect(await docs.saveUnsaved()).toEqual([]);
    expect(host.surface.docs.saved).toEqual(['a.ts', 'b.ts']);
    expect(await docs.unsaved()).toEqual([]);
  });
});
