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
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  private readonly head = signal<{ path: string; text: string | null } | null>(null);
  private hunkHandler: ((hunk: Hunk, box: HunkBox) => void) | null = null;
  private symbolHandler: ((spot: SymbolSpot) => void) | null = null;
  private caretHandler: ((path: string, line: number, character: number) => void) | null = null;

  private view: EditorView | null = null;
  private open: Signal<boolean> | null = null;
  private shown: string | null = null;
  private extras: ReadonlySignal<Extension[]> | null = null;

  constructor(private readonly ide: Ide) {}

  private get lsp(): LspPlugin {
    return this.ide.getPlugin(LspPlugin);
  }

  private get code(): CodePlugin {
    return this.ide.getPlugin(CodePlugin);
  }

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

  private opened(): { value: boolean } {
    this.open ??= this.ide.remember('panel.open', true);
    return this.open;
  }

  @command('panel.editor')
  protected togglePanel(): void {
    const open = this.opened();
    open.value = !open.value;
  }

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

  onCaret(handler: ((path: string, line: number, character: number) => void) | null): void {
    this.caretHandler = handler;
  }

  onSymbolAsk(handler: ((spot: SymbolSpot) => void) | null): void {
    this.symbolHandler = handler;
  }

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

  private empty() {
    const views = this.ide.registry<EmptyView>('editor.empty').all.value;
    if (views.length === 0) return <div class="editor-nothing">{this.ide.t('editor.nothing')}</div>;
    return <>{views.map((one) => one.view() as never)}</>;
  }

  setHead(path: string, text: string | null): void {
    this.head.value = { path, text };
  }

  onHunk(handler: ((hunk: Hunk, box: HunkBox) => void) | null): void {
    this.hunkHandler = handler;
  }

  private headFor(path: string): string | null {
    const known = this.head.value;
    return known && known.path === path ? known.text : null;
  }

  toggle(): void {
    if (this.open) this.open.value = !this.open.value;
  }
}
