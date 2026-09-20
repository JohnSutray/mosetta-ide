import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import {
  addCursorAbove,
  addCursorBelow,
  copyLineDown,
  cursorGroupLeft,
  cursorGroupRight,
  deleteLine,
  indentLess,
  indentMore,
  moveLineDown,
  moveLineUp,
  redo,
  selectGroupLeft,
  selectGroupRight,
  toggleComment,
  undo,
} from '@codemirror/commands';
import { computed, effect, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import { activate, command, configSection, plugin, registry, type HunkBox, type Ide } from '@mosetta/ide-api/client';
import LspPlugin from '@mosetta/ide-plugin-lsp';
import CodePlugin, { EDITOR_DEFAULTS, EDITOR_SCHEMA } from '@mosetta/ide-plugin-code';
import type { EditorSettings } from '@mosetta/ide-plugin-code';
import type { DocState } from '@mosetta/ide-protocol';
import type { Hunk } from '@mosetta/ide-plugin-code';
import { GitMarks } from './git-marks.js';
import {
  EMPTY_SCHEMA,
  EXTENSION_SCHEMA,
  HOVER_SCHEMA,
  VIEW_SCHEMA,
  type EditorExtension,
  type EmptyView,
  type FileView,
  type HoverSource,
} from './schema.js';

export type { HoverSource, HoverSpot } from './schema.js';
import { STYLE } from './style.js';
import { EditorIcon } from './icon.js';
import { CodeEditor } from './view.js';
import { DivergedBadge } from './diverged.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';

/**
 * What is asked about a symbol: the place, the whole line, and where it is on screen.
 * The whole line is needed in order to take the word under the caret out of it.
 */
export interface SymbolSpot {
  line: number;
  character: number;
  text: string;
  box: { x: number; y: number };
}

@registry({ key: 'editor.empty', schema: EMPTY_SCHEMA })
@registry({ key: 'file.view', schema: VIEW_SCHEMA })
@registry({ key: 'editor.extension', schema: EXTENSION_SCHEMA })
@registry({ key: 'editor.hover', schema: HOVER_SCHEMA })
@configSection({ section: 'editor', defaults: EDITOR_DEFAULTS, schema: EDITOR_SCHEMA })
@plugin({ title: 'plugin.editor' })
export default class Editor {
  /** Documents are a neighbour: what is open, where to jump, how to edit. */
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  /**
   * What the file was in the commit is BROUGHT by a neighbour rather than asked of the
   * core. The editor draws the strips from what it was given and does not know whose
   * they are: no git plugin means no strips, and that is honest.
   *
   * The path travels with the text: between opening a file and the answer there is time
   * for a frame in which the new file is compared with the OLD answer.
   */
  private readonly head = signal<{ path: string; text: string | null } | null>(null);
  private hunkHandler: ((hunk: Hunk, box: HunkBox) => void) | null = null;
  private symbolHandler: ((spot: SymbolSpot) => void) | null = null;
  private caretHandler: ((path: string, line: number, character: number) => void) | null = null;

  /** The live editor. Private: it is not handed outwards even to a neighbour. */
  private view: EditorView | null = null;
  /**
   * Whether the middle is open. The one panel open from the very start: without it one
   * sees an empty space rather than an IDE.
   */
  private open: Signal<boolean> | null = null;
  /** Which file was shown last time: a change opens the middle. */
  private shown: string | null = null;
  /** The neighbours' extensions: one list, while the registry has not changed. */
  private extras: ReadonlySignal<Extension[]> | null = null;

  constructor(private readonly ide: Ide) {}

  /**
   * The language server is a neighbour: the open file's diagnostics, and the hover
   * tooltip.
   */
  private get lsp(): LspPlugin {
    return this.ide.getPlugin(LspPlugin);
  }

  /**
   * The code display is a neighbour: the look, the languages, the diff, the input
   * mechanics.
   */
  private get code(): CodePlugin {
    return this.ide.getPlugin(CodePlugin);
  }

  /** The git strips run on the code display's diff; they are created on the first draw. */
  private marks: GitMarks | null = null;

  private gitMarks(): GitMarks {
    this.marks ??= new GitMarks(this.code.diff);
    return this.marks;
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry('keys.mechanics').add({ id: 'editor', keys: (isMac: boolean) => this.code.input.keys(isMac) });
    const registered = this.ide.registry<EditorExtension>('editor.extension').all;
    this.extras = computed(() => registered.value.map((one) => one.extension as Extension));

    const open = this.opened();

    this.ide.registry('panel').add({
      id: 'editor',
      title: 'panel.editor.empty',
      side: 'main',
      open,
      view: () => this.body(),
      heading: () => this.docs.openDoc.value?.path ?? this.docs.viewedFile.value,
      badges: () => this.badges(),
      close: () => {
        if (this.docs.openDoc.value || this.docs.viewedFile.value) void this.docs.closeFile();
        else open.value = false;
      },
    });

    this.ide.registry('toolbar.button').add({
      id: 'editor',
      title: 'toolbar.editor',
      command: 'panel.editor',
      icon: EditorIcon,
      active: open,
    });

    effect(() => {
      const path = this.docs.openDoc.value?.path ?? this.docs.viewedFile.value;
      if (path && path !== this.shown) open.value = true;
      this.shown = path;
    });
  }

  /**
   * Whether the editor's column is open — the core's memory. A lazy field rather than a
   * local at startup: the command is declared by an annotation and is called
   * independently of it.
   */
  private opened(): { value: boolean } {
    this.open ??= this.ide.remember('panel.open', true);
    return this.open;
  }

  @command('panel.editor')
  protected togglePanel(): void {
    const open = this.opened();
    open.value = !open.value;
  }

  /** We run an editor command only where there is an editor. */
  private inEditor(run: (view: EditorView) => boolean): void {
    if (this.view) run(this.view);
  }

  @command('edit.undo') protected undo(): void { this.inEditor(undo); }
  @command('edit.redo') protected redo(): void { this.inEditor(redo); }
  @command('edit.deleteLine') protected deleteLine(): void { this.inEditor(deleteLine); }
  @command('edit.duplicateLine') protected duplicateLine(): void { this.inEditor(copyLineDown); }
  @command('edit.toggleComment') protected toggleComment(): void { this.inEditor(toggleComment); }
  @command('edit.moveLineUp') protected moveLineUp(): void { this.inEditor(moveLineUp); }
  @command('edit.moveLineDown') protected moveLineDown(): void { this.inEditor(moveLineDown); }
  @command('edit.addCursorAbove') protected addCursorAbove(): void { this.inEditor(addCursorAbove); }
  @command('edit.addCursorBelow') protected addCursorBelow(): void { this.inEditor(addCursorBelow); }
  @command('edit.wordLeft') protected wordLeft(): void { this.inEditor(cursorGroupLeft); }
  @command('edit.wordRight') protected wordRight(): void { this.inEditor(cursorGroupRight); }
  @command('edit.selectWordLeft') protected selectWordLeft(): void { this.inEditor(selectGroupLeft); }
  @command('edit.selectWordRight') protected selectWordRight(): void { this.inEditor(selectGroupRight); }
  @command('edit.indent') protected indent(): void { this.inEditor(indentMore); }
  @command('edit.unindent') protected unindent(): void { this.inEditor(indentLess); }

  @command('symbol.goto')
  protected gotoSymbol(): void {
    const view = this.view;
    if (!view) return;
    this.ask(view, view.state.selection.main.head);
  }

  /**
   * Ask about the symbol at this position — by the same route as by key.
   *
   * What that means is not known to the editor: it names the PLACE — the line, the
   * column, the line itself and where it is on screen — and the answer comes from
   * whoever subscribed. No symbols plugin means the question hangs, and that is honest.
   */
  private ask(view: EditorView, at: number): void {
    const line = view.state.doc.lineAt(at);
    const coords = view.coordsAtPos(at);
    this.symbolHandler?.({
      line: line.number - 1,
      character: at - line.from,
      text: line.text,
      box: { x: coords?.left ?? 0, y: coords?.bottom ?? 0 },
    });
  }

  /** A neighbour listens to the caret: the visit history lives with them. */
  onCaret(handler: ((path: string, line: number, character: number) => void) | null): void {
    this.caretHandler = handler;
  }

  /** A neighbour takes the questions about a symbol: the key, and Cmd+click. */
  onSymbolAsk(handler: ((spot: SymbolSpot) => void) | null): void {
    this.symbolHandler = handler;
  }

  /**
   * The marks in the header: the file is read-only, and there are unsaved edits.
   *
   * Both are about ONE AND THE SAME THING — whether what is on screen can be trusted —
   * and that is why they stand next to the file's name rather than in a corner of the
   * screen.
   */
  private badges() {
    const file = this.docs.openDoc.value;
    if (!file) return null;
    return (
      <>
        {file.truncated && <span class="tag">read-only</span>}
        {this.docs.dirty.value && <span class="tag is-dirty">modified</span>}
      </>
    );
  }

  /**
   * A view of its own for a file: the first that takes such a path on.
   *
   * The first rather than "the most suitable": competing for a file is exactly the
   * place where two plugins start fighting quietly, and the winner is visible nowhere
   * in the interface. The order of the entries is the order of the distribution, and it
   * is readable in the `plugins` setting.
   */
  private viewFor(path: string): FileView | null {
    return this.ide.registry<FileView>('file.view').all.value.find((one) => one.opens(path)) ?? null;
  }

  private body() {
    const viewed = this.docs.viewedFile.value;
    if (viewed) {
      const show = this.viewFor(viewed);
      return show ? (show.view({ path: viewed, text: '' }, () => null) as never) : this.empty();
    }
    const file = this.docs.openDoc.value;
    if (!file) return this.empty();
    const show = this.viewFor(file.path);
    if (show) return show.view({ path: file.path, text: this.docs.liveText.value }, () => this.text(file)) as never;
    return this.text(file);
  }

  /**
   * An ordinary code editor. The first frame waits for the settings from the server:
   * assembling it with the defaults and rebuilding it at once with the real values
   * would mean losing the undo history.
   */
  private text(file: DocState) {
    if (!this.ide.settings.value) return null;
    return this.codeEditor(file, this.ide.settingsOf('editor', EDITOR_DEFAULTS).value);
  }

  private codeEditor(file: DocState, config: EditorSettings) {
    return (
      <div class="editor-host">
        <DivergedBadge path={file.path} ide={this.ide} />
        <CodeEditor
          file={file}
          head={this.headFor(file.path)}
          onHunk={(hunk, box) => this.hunkHandler?.(hunk, box)}
          docKey={this.docs.openEpoch.value}
          externalEpoch={this.docs.externalEpoch.value}
          reveal={this.docs.pendingReveal.value}
          wantsFocus={this.docs.wantsFocus.value}
          settings={config}
          diagnostics={this.lsp.fileDiagnostics.value}
          onEdit={(text) => this.docs.editDoc(text)}
          onBlur={() => this.docs.editorLeft()}
          onCaret={(line, character) => this.caretHandler?.(file.path, line, character)}
          onModClick={(pos) => {
            if (this.view) this.ask(this.view, pos);
          }}
          onHover={(path, line, character) => this.lsp.hover(path, line, character)}
          hoverSources={() => this.ide.registry<HoverSource>('editor.hover').all.value}
          onMount={(view) => (this.view = view)}
          code={this.code}
          takeFocus={() => this.docs.takeFocusOnMount()}
          chordHeld={(command, event) => this.ide.getPlugin(KeymapPlugin).chordHeld(command, event)}
          marks={this.gitMarks()}
          extra={this.extras?.value ?? []}
        />
      </div>
    );
  }

  /**
   * The empty middle. What to fill it with is not the editor's decision: it declares a
   * key, and anything may be put there — even pixel sheep. Nobody put anything in: we
   * say so in words, and that is an honest answer to "why is it empty here" rather than
   * a stub.
   */
  private empty() {
    const views = this.ide.registry<EmptyView>('editor.empty').all.value;
    if (views.length === 0) return <div class="editor-nothing">{this.ide.t('editor.nothing')}</div>;
    return <>{views.map((one) => one.view() as never)}</>;
  }

  /** A neighbour brought the version from the commit: we draw the strips from it. */
  setHead(path: string, text: string | null): void {
    this.head.value = { path, text };
  }

  /** Who answers a click on a strip. One: two reactions to a click is a fight. */
  onHunk(handler: ((hunk: Hunk, box: HunkBox) => void) | null): void {
    this.hunkHandler = handler;
  }

  /** The answer about THIS file — or nothing, until it has arrived. */
  private headFor(path: string): string | null {
    const known = this.head.value;
    return known && known.path === path ? known.text : null;
  }

  toggle(): void {
    if (this.open) this.open.value = !this.open.value;
  }
}
