import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import { RpcErrorCode } from '@mosetta/ide-protocol';
import DocPlugin from '../src/client.js';

/**
 * The document as a plugin: what it promises its neighbours.
 *
 * The wire is a fake: the "server" answers with what the test put in, and the test
 * fires the events. What is checked are the layer's promises rather than the socket.
 */
const NAME = '@mosetta/ide-plugin-doc';
const PROJECT = { id: 'p1', root: '/one', name: 'one' } as never;
const OTHER = { id: 'p2', root: '/two', name: 'two' } as never;

let host: FakeHost;
let plugin: DocPlugin;

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  (globalThis as Record<string, unknown>)['document'] ??= {};
  host = new FakeHost();
  plugin = host.add(DocPlugin, NAME);
  host.surface.docs.texts.set('a.ts', 'one');
  host.surface.docs.texts.set('b.ts', 'two');
  await host.start();
  host.surface.workspaceCurrent.value = PROJECT;
  host.surface.project.value = PROJECT;
  await settle();
});

describe('the document', () => {
  it('opens over the wire and closes the previous one', async () => {
    await plugin.openFile('a.ts');
    expect(plugin.openDoc.value?.text).toBe('one');
    await plugin.openFile('b.ts');
    expect(host.surface.docs.closed).toEqual(['a.ts']);
    expect(plugin.openDoc.value?.path).toBe('b.ts');
  });

  it('an edit travels to the server after a pause, while the dirtiness shows at once', async () => {
    await plugin.openFile('a.ts');
    plugin.editDoc('one-two');
    expect(plugin.dirty.value).toBe(true);
    expect(host.surface.docs.edits).toEqual([]);
    await plugin.doc.sync.flush();
    expect(host.surface.docs.edits).toEqual([{ path: 'a.ts', text: 'one-two' }]);
  });

  it('goTo opens another file and asks for the caret; in its own it only asks', async () => {
    await plugin.goTo('a.ts', 7, 2);
    expect(plugin.openDoc.value?.path).toBe('a.ts');
    expect(plugin.pendingReveal.value).toMatchObject({ path: 'a.ts', line: 7, character: 2, epoch: 1 });
    await plugin.goTo('a.ts', 9);
    expect(host.surface.docs.opened).toEqual(['a.ts']);
    expect(plugin.pendingReveal.value).toMatchObject({ line: 9, epoch: 2 });
  });

  it('a save ran into disk — it asks for the argument to be shown rather than complaining', async () => {
    await plugin.openFile('a.ts');
    const asked: string[] = [];
    plugin.doc.onMergeRequested((path) => asked.push(path));
    host.surface.docs.saveFails = { code: RpcErrorCode.RevisionConflict, message: 'disk moved on' };
    host.run('file.save');
    await settle();
    expect(asked).toEqual(['a.ts']);
    expect(host.ide(NAME).complaints).toEqual([]);
  });

  it('the file vanished — we go back to the previous one', async () => {
    await plugin.openFile('a.ts');
    await plugin.openFile('b.ts');
    host.surface.docs.fireRemoved({ path: 'b.ts' });
    await settle();
    expect(plugin.openDoc.value?.path).toBe('a.ts');
    expect(host.ide(NAME).complaints.at(-1)).toContain('file.gone');
  });

  it('attaching opens what the tab remembered; changing project resets it', async () => {
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

  it('an external edit updates the open file and says so, an expected one stays silent', async () => {
    await plugin.openFile('a.ts');
    host.surface.docs.texts.set('a.ts', 'from outside');
    host.surface.docs.fireExternal({ path: 'a.ts', revision: 'r2' });
    await settle();
    expect(plugin.openDoc.value?.text).toBe('from outside');
    expect(host.ide(NAME).said.at(-1)).toContain('file.external');
    plugin.doc.expectExternal('a.ts');
    host.surface.docs.fireExternal({ path: 'a.ts', revision: 'r3' });
    await settle();
    expect(host.ide(NAME).said.filter((one) => one.includes('file.external'))).toHaveLength(1);
  });

  it('another tab was editing the same file — we take the server\'s text rather than inventing our version', async () => {
    await plugin.openFile('a.ts');
    const epoch = plugin.externalEpoch.value;
    host.surface.docs.fireChanged({ path: 'a.ts', version: plugin.openDoc.value!.version, dirty: false });
    await settle();
    expect(plugin.externalEpoch.value).toBe(epoch);
    host.surface.docs.texts.set('a.ts', 'from the neighbouring tab');
    host.surface.docs.fireChanged({ path: 'a.ts', version: plugin.openDoc.value!.version + 1, dirty: true });
    await settle();
    expect(plugin.openDoc.value?.text).toBe('from the neighbouring tab');
    expect(plugin.externalEpoch.value).toBe(epoch + 1);
  });

  it('an outdated version on sending also pulls the server in rather than complaining', async () => {
    await plugin.openFile('a.ts');
    const epoch = plugin.externalEpoch.value;
    host.surface.docs.editFails = { code: RpcErrorCode.StaleVersion, message: 'stale' };
    host.surface.docs.texts.set('a.ts', 'the server knows better');
    plugin.editDoc('mine');
    await plugin.doc.sync.flush();
    await settle();
    expect(plugin.openDoc.value?.text).toBe('the server knows better');
    expect(plugin.externalEpoch.value).toBe(epoch + 1);
    expect(host.ide(NAME).complaints).toEqual([]);
  });

  it('the open number rises on another file and does not rise when the same one moves', async () => {
    await plugin.openFile('a.ts');
    const epoch = plugin.openEpoch.value;
    host.surface.docs.texts.set('c.ts', 'one');
    host.surface.docs.fireMoved({ from: 'a.ts', path: 'c.ts' });
    await settle();
    expect(plugin.openDoc.value?.path).toBe('c.ts');
    expect(plugin.openEpoch.value).toBe(epoch);
    await plugin.openFile('b.ts');
    expect(plugin.openEpoch.value).toBe(epoch + 1);
  });
});

/**
 * A file is not always a document.
 *
 * An image is not pulled into memory and does not become a document at all. It can
 * still be opened: a view of its own takes it on, and then a FILE is open and it has no
 * text.
 */
describe('a file opened by something other than a document', () => {
  /** A view entry as the image plugin puts it in. */
  function shows(prefix: string, text: boolean): void {
    host.registry.add(
      'file.view',
      { id: prefix, opens: (path: string) => path.endsWith(prefix), text, view: () => null },
      '@mosetta/ide-plugin-image',
    );
  }

  it('a view without text: we do not open a document at all', async () => {
    shows('.png', false);
    await plugin.openFile('logo.png');
    expect(plugin.viewedFile.value).toBe('logo.png');
    expect(plugin.openDoc.value).toBeNull();
    expect(host.surface.docs.opened).not.toContain('logo.png');
  });

  it('a view that does need text opens a document as usual', async () => {
    shows('.ts', true);
    await plugin.openFile('a.ts');
    expect(plugin.openDoc.value?.path).toBe('a.ts');
    expect(plugin.viewedFile.value).toBeNull();
  });

  it('the document and the view put each other out: there is one place', async () => {
    shows('.png', false);
    await plugin.openFile('a.ts');
    await plugin.openFile('logo.png');
    expect(plugin.openDoc.value).toBeNull();
    expect(plugin.viewedFile.value).toBe('logo.png');

    await plugin.openFile('a.ts');
    expect(plugin.viewedFile.value).toBeNull();
    expect(plugin.openDoc.value?.path).toBe('a.ts');
  });

  it('what was never a document can be closed too', async () => {
    shows('.png', false);
    await plugin.openFile('logo.png');
    await plugin.closeFile();
    expect(plugin.viewedFile.value).toBeNull();
  });

  it('the live text is the edit rather than what the server managed to confirm', async () => {
    await plugin.openFile('a.ts');
    expect(plugin.liveText.value).toBe('one');
    plugin.editDoc('one-two');
    expect(plugin.liveText.value).toBe('one-two');
  });
});
