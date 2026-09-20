import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DocPlugin from '../src/client.js';

/**
 * Autosave on losing focus.
 *
 * The editor reports a FACT ("the keyboard left the text") and the document decides:
 * the `doc.autosave` setting is its section, and writing to disk is its job. Which is
 * why this is checked here, without CodeMirror.
 */

const NAME = '@mosetta/ide-plugin-doc';

describe('autosave', () => {
  let host: FakeHost;
  let docs: DocPlugin;

  beforeEach(async () => {
    host = new FakeHost();
    docs = host.add(DocPlugin, NAME);
    host.surface.docs.texts.set('a.ts', 'let x = 1\n');
    host.surface.docs.texts.set('b.ts', 'two');
    await host.start();
    await docs.openFile('a.ts');
    docs.editDoc('let x = 2\n');
  });

  it('factory is off: the focus left and the file stayed unsaved', () => {
    docs.editorLeft();
    expect(host.surface.docs.saved).toEqual([]);
    expect(docs.dirty.value).toBe(true);
    expect(docs.autosaves).toBe(false);
  });

  it('`focusLost` writes to disk exactly when the keyboard left', async () => {
    host.setSettings({ doc: { autosave: 'focusLost' } });
    expect(docs.autosaves).toBe(true);
    docs.editorLeft();
    await new Promise((done) => setTimeout(done, 0));
    expect(host.surface.docs.saved).toEqual(['a.ts']);
    expect(docs.dirty.value).toBe(false);
  });

  it('nothing to write — we stay silent: losing focus does not touch disk by itself', async () => {
    host.setSettings({ doc: { autosave: 'focusLost' } });
    docs.editorLeft();
    await new Promise((done) => setTimeout(done, 0));
    host.surface.docs.saved.length = 0;
    docs.editorLeft();
    await new Promise((done) => setTimeout(done, 0));
    expect(host.surface.docs.saved).toEqual([]);
  });

  it('the answer to a save does not overwrite a file opened while it was in flight', async () => {
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
    expect(docs.openDoc.value?.text).toBe('two');
    docs.editDoc('two-three');
    await docs.doc.sync.flush();
    expect(wire.edits.at(-1)).toEqual({ path: 'b.ts', text: 'two-three' });
  });

  /**
   * "What is unsaved" is asked of the MEMORY LAYER: a dirty document lives there after
   * the tab has closed it, and a debugger's breakpoint stands in a closed file too.
   */
  it('what is unsaved is counted by the memory layer rather than by the open file', async () => {
    host.surface.docs.unsavedPaths.add('b.ts');
    expect(await docs.unsaved()).toEqual(['a.ts', 'b.ts']);
    host.surface.docs.texts.set('b.ts', 'x\n');
    expect(await docs.saveUnsaved()).toEqual([]);
    expect(host.surface.docs.saved).toEqual(['a.ts', 'b.ts']);
    expect(await docs.unsaved()).toEqual([]);
  });
});
