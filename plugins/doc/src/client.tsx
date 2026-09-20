import { activate, command, configSection, plugin } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { effect } from '@preact/signals';
import { Doc } from './doc.js';
import { EditorFocus } from './focus.js';
import { DOC_DEFAULTS, DOC_FIELDS, DOC_SCHEMA, type Autosave } from './settings.js';

export type { Reveal } from './doc.js';
export { DOC_DEFAULTS, type Autosave, type DocSettings } from './settings.js';

@configSection({ section: 'doc', defaults: DOC_DEFAULTS, schema: DOC_SCHEMA, fields: DOC_FIELDS })
@plugin({ title: 'plugin.doc' })
export default class DocPlugin {
  readonly doc: Doc;
  readonly focus = new EditorFocus();

  constructor(private readonly ide: Ide) {
    this.doc = new Doc(this.ide.docs, {
      say: (message) => ide.say(message),
      complain: (message) => ide.complain(message),
      sayOnce: (slot, message) => ide.sayOnce(slot, message),
      t: ide.t,
      remembered: (root) => ide.remember<string | null>(`file:${root}`, null, 'tab'),
    });
  }

  @command('file.save') protected save(): void { void this.doc.save(); }
  @command('file.reload') protected reload(): void { void this.doc.reload(); }

  @activate() protected start(): void {
    effect(() => {
      this.ide.workspaces.current.value;
      this.doc.reset();
    });
    effect(() => {
      const ws = this.ide.project.value;
      if (ws) void this.attach(ws.root);
    });
    effect(() => {
      const ws = this.ide.workspaces.current.value;
      const file = this.doc.open.value;
      if (!ws) return;
      this.ide.mount.title(file ? `${file.path} — ${ws.name}` : ws.name);
    });
  }

  private async attach(root: string): Promise<void> {
    const path = this.doc.remembers(root);
    if (path && this.shownWithoutText(path)) {
      await this.doc.view(path, root);
      return;
    }
    await this.doc.attached(root);
  }

  private shownWithoutText(path: string): boolean {
    const shown = this.ide
      .registry<{ opens: (path: string) => boolean; text?: boolean }>('file.view')
      .all.value.find((one) => one.opens(path));
    return shown?.text === false;
  }

  async openFile(path: string, options?: { focus?: boolean }): Promise<void> {
    this.doc.openAsked.value += 1;
    const root = this.ide.workspaces.current.value?.root ?? null;
    if (this.shownWithoutText(path)) {
      await this.doc.view(path, root);
      return;
    }
    if (options?.focus === false) this.focus.openWithoutFocus();
    await this.doc.openAt(path, root);
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
  get viewedFile() {
    return this.doc.viewed;
  }
  get liveText() {
    return this.doc.text;
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
  get openAsked() {
    return this.doc.openAsked;
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

  private get autosave(): Autosave {
    return this.ide.settingsOf('doc', DOC_DEFAULTS).value.autosave;
  }

  get autosaves(): boolean {
    return this.autosave !== 'off';
  }

  editorLeft(): void {
    if (this.autosave !== 'focusLost') return;
    if (!this.doc.dirty.peek()) return;
    void this.doc.save({ auto: true });
  }

  async unsaved(): Promise<string[]> {
    await this.flushDocs();
    return this.ide.docs.unsaved();
  }

  async saveUnsaved(): Promise<string[]> {
    const failed: string[] = [];
    for (const path of await this.unsaved()) {
      if (this.doc.open.peek()?.path === path) {
        await this.doc.save({ auto: true });
        if (this.doc.dirty.peek()) failed.push(path);
        continue;
      }
      await this.ide.docs.save(path).catch(() => failed.push(path));
    }
    return failed;
  }

  flushDocs(): Promise<void> {
    return this.doc.sync.flush();
  }
  editDoc(text: string): void {
    this.doc.edit(text);
  }

  replaceText(text: string): void {
    this.doc.replace(text);
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
