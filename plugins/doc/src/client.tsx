import { activate, command, configSection, plugin } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { effect } from '@preact/signals';
import { Doc } from './doc.js';
import { EditorFocus } from './focus.js';
import { DOC_DEFAULTS, DOC_FIELDS, DOC_SCHEMA, type Autosave } from './settings.js';

export type { Reveal } from './doc.js';
export { DOC_DEFAULTS, type Autosave, type DocSettings } from './settings.js';

/**
 * The document is a plugin.
 *
 * The core hands over the wire to the memory layer (`docs`), and what is open, what was
 * edited, where to jump and what diverged from disk is remembered by us. Neighbours
 * take that under the names the contract used to hand out, only from the shared table
 * under our own name: `import { openDoc, goTo } from '@mosetta/ide-plugin-doc'`.
 *
 * The names read the CURRENT instance, the same way the contract reads the
 * application's surface. This is a named exception to the rule against globals: whoever
 * provides a service everybody uses hands it over by name rather than making every
 * component carry an instance as a prop.
 */
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

  /**
   * Bring back what was open. Through the same door as opening by hand: what was
   * remembered may well be an image, and asking a document about one means a refusal
   * and losing it from the tab's memory.
   */
  private async attach(root: string): Promise<void> {
    const path = this.doc.remembers(root);
    if (path && this.shownWithoutText(path)) {
      await this.doc.view(path, root);
      return;
    }
    await this.doc.attached(root);
  }

  /**
   * Whether a view that needs no text has taken this file on.
   *
   * The key is read as a STRING rather than by importing the editor: the view is
   * declared by whoever draws the middle, and all we need to know is whether text is
   * needed. No editor means no entries, and everything goes as before.
   */
  private shownWithoutText(path: string): boolean {
    const shown = this.ide
      .registry<{ opens: (path: string) => boolean; text?: boolean }>('file.view')
      .all.value.find((one) => one.opens(path));
    return shown?.text === false;
  }

  /**
   * Open a file in the editor. `focus: false` leaves the keyboard where it was: a
   * single click in the tree must not take the focus away.
   */
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

  /**
   * Show a place in the code: open the file if need be, and ASK for the caret to be
   * placed — jumping is done by whoever draws the text.
   */
  async goTo(path: string, line: number, character = 0): Promise<void> {
    if (this.doc.open.peek()?.path !== path) await this.openFile(path);
    this.doc.reveal(path, line, character);
  }

  /**
   * A file's text from memory WITHOUT opening it: looking is not opening, otherwise the
   * language server's document counter drifts.
   */
  async peekFile(path: string): Promise<{ path: string; text: string }> {
    const state = await this.ide.docs.state(path);
    return { path: state.path, text: state.text };
  }

  closeFile(): Promise<void> {
    return this.doc.close(this.ide.workspaces.current.value?.root ?? null);
  }

  /**
   * What is open: a neighbour reads `docs.openDoc.value` rather than a module-level
   * name.
   */
  get openDoc() {
    return this.doc.open;
  }
  /**
   * A file opened by something other than a document: a path, or `null`. It has no text
   * — it has whoever took on showing it.
   */
  get viewedFile() {
    return this.doc.viewed;
  }
  /**
   * The live text of the open document: what is visible in the editor RIGHT NOW,
   * unsaved edit included. It is read by views that draw what they edit — markup and
   * SVG.
   */
  get liveText() {
    return this.doc.text;
  }
  /** Whether there are unsaved edits: dirtiness appears between arrivals of `DocState`. */
  get dirty() {
    return this.doc.dirty;
  }
  get externalEpoch() {
    return this.doc.externalEpoch;
  }
  /**
   * The open number: another file means another editor; the same one moving means the
   * same editor.
   */
  get openEpoch() {
    return this.doc.openEpoch;
  }
  /** How many times an open was asked for — including for a file already open. */
  get openAsked() {
    return this.doc.openAsked;
  }
  get pendingReveal() {
    return this.doc.pendingReveal;
  }
  /** Files that have diverged from disk: a fact about a file rather than an accident. */
  get diverged() {
    return this.doc.diverged;
  }
  /** A request to move the keyboard into the text. Rising means it was asked again. */
  get wantsFocus() {
    return this.focus.wanted;
  }

  /** What makes us write by ourselves; `off` means by hand only. */
  private get autosave(): Autosave {
    return this.ide.settingsOf('doc', DOC_DEFAULTS).value.autosave;
  }

  /**
   * Whether the document writes by itself. Asked by a neighbour to whom it matters NOT
   * to ask the user: with autosave on, "save before running?" is a question about
   * something already agreed.
   */
  get autosaves(): boolean {
    return this.autosave !== 'off';
  }

  /**
   * The keyboard left the text — the editor said so.
   *
   * Decided here rather than there: saving is the document's job, and the editor
   * reports a FACT, as it does about the caret. Another editor would report the same
   * one.
   */
  editorLeft(): void {
    if (this.autosave !== 'focusLost') return;
    if (!this.doc.dirty.peek()) return;
    void this.doc.save({ auto: true });
  }

  /**
   * What is unsaved, as paths.
   *
   * First we FLUSH our own: an edit travels to the server after a pause, and without
   * this "nothing is unsaved" would be an answer about the second before last. We ask
   * the memory layer rather than the open document: a dirty one lives on after the tab
   * has closed it.
   */
  async unsaved(): Promise<string[]> {
    await this.flushDocs();
    return this.ide.docs.unsaved();
  }

  /**
   * Write everything that diverged from disk onto it. Returns what could NOT be
   * written: disk moved ahead, which is an argument, and settling it is the user's.
   */
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

  /**
   * Flush what is unsaved to the server: before a file moves, and before a question to
   * the server.
   */
  flushDocs(): Promise<void> {
    return this.doc.sync.flush();
  }
  /** The text was edited: whole, because the text's owner is whoever draws it. */
  editDoc(text: string): void {
    this.doc.edit(text);
  }

  /**
   * A NEIGHBOUR changed the text (reverting a git hunk): not only send it to the server
   * but ask the editor to take it, since CodeMirror's contents are changed only by
   * itself.
   */
  replaceText(text: string): void {
    this.doc.replace(text);
  }
  /** Re-read the open file from disk, throwing away what is unsaved. */
  reloadFile(): Promise<void> {
    return this.doc.reload();
  }
  /** Whether to take the keyboard when the editor is born — a one-shot mark. */
  takeFocusOnMount(): boolean {
    return this.focus.takeOnMount();
  }
  /**
   * The document asks for the argument about a file to be shown: a save ran into it, or
   * the strip was clicked.
   */
  onMergeRequested(handler: (path: string) => void): () => void {
    return this.doc.onMergeRequested(handler);
  }
  /** This file's text is about to come back from outside — do not complain about that. */
  expectExternal(path: string): void {
    this.doc.expectExternal(path);
  }
  /** The argument is settled: the "diverged from disk" strip goes out. */
  forgetDiverged(path: string): void {
    this.doc.forgetDiverged(path);
  }
}
