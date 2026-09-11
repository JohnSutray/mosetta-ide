import { activate, plugin } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { effect } from '@preact/signals';
import { Doc } from './doc.js';
import { EditorFocus } from './focus.js';

export type { Reveal } from './doc.js';

@plugin({ title: 'plugin.doc' })
export default class DocPlugin {
  readonly doc: Doc;
  readonly focus = new EditorFocus();

  constructor(private readonly ide: Ide) {
    this.doc = new Doc(this.ide.docs, {
      say: (message) => ide.say(message),
      complain: (message) => ide.complain(message),
      t: ide.t,
      remembered: (root) => ide.remember<string | null>(`file:${root}`, null, 'tab'),
    });
  }

  @activate() protected start(): void {
    this.ide.command('file.save', () => void this.doc.save());
    this.ide.command('file.reload', () => void this.doc.reload());

    effect(() => {
      this.ide.workspaces.current.value;
      this.doc.reset();
    });
    effect(() => {
      const ws = this.ide.project.value;
      if (ws) void this.doc.attached(ws.root);
    });
    effect(() => {
      const ws = this.ide.workspaces.current.value;
      const file = this.doc.open.value;
      if (!ws) return;
      this.ide.mount.title(file ? `${file.path} — ${ws.name}` : ws.name);
    });
  }

  async openFile(path: string, options?: { focus?: boolean }): Promise<void> {
    if (options?.focus === false) this.focus.openWithoutFocus();
    await this.doc.openAt(path, this.ide.workspaces.current.value?.root ?? null);
    if (options?.focus) this.focus.focus();
  }

  async goTo(path: string, line: number, character = 0): Promise<void> {
    if (this.doc.open.peek()?.path !== path) await this.openFile(path);
    this.doc.reveal(path, line, character);
  }

  async peekFile(path: string): Promise<{ path: string; text: string }> {
    const state = await this.ide.docs.state(path);
    return { path: state.path, text: state.text };
  }

  closeFile(): Promise<void> {
    return this.doc.close(this.ide.workspaces.current.value?.root ?? null);
  }

  get openDoc() {
    return this.doc.open;
  }
  get dirty() {
    return this.doc.dirty;
  }
  get externalEpoch() {
    return this.doc.externalEpoch;
  }
  get openEpoch() {
    return this.doc.openEpoch;
  }
  get pendingReveal() {
    return this.doc.pendingReveal;
  }
  get diverged() {
    return this.doc.diverged;
  }
  get wantsFocus() {
    return this.focus.wanted;
  }
  flushDocs(): Promise<void> {
    return this.doc.sync.flush();
  }
  editDoc(text: string): void {
    this.doc.edit(text);
  }
  reloadFile(): Promise<void> {
    return this.doc.reload();
  }
  takeFocusOnMount(): boolean {
    return this.focus.takeOnMount();
  }
  onMergeRequested(handler: (path: string) => void): () => void {
    return this.doc.onMergeRequested(handler);
  }
  expectExternal(path: string): void {
    this.doc.expectExternal(path);
  }
  forgetDiverged(path: string): void {
    this.doc.forgetDiverged(path);
  }
}
