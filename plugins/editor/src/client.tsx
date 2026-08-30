import type { EditorView } from '@codemirror/view';
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
import { effect } from '@preact/signals';
import {
  activate,
  askSymbol,
  closeFile,
  dirty,
  editDoc,
  externalEpoch,
  fileDiagnostics,
  headFor,
  hover,
  openDoc,
  pendingReveal,
  registry,
  settings,
  showHunk,
  t,
  visit,
  wantsFocus,
  type Ide,
  type PanelHandle,
} from '@ide/api/client';
import { EMPTY_SCHEMA, type EmptyView } from './schema.js';
import { STYLE } from './style.js';
import { EditorIcon } from './icon.js';
import { CodeEditor } from './view.js';

@registry({ key: 'editor.empty', schema: EMPTY_SCHEMA })
export default class Editor {
  private view: EditorView | null = null;
  private panel: PanelHandle | null = null;
  private shown: string | null = null;

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);

    const panel = this.ide.panel({
      id: 'editor',
      title: 'panel.editor.empty',
      side: 'main',
      command: 'panel.editor',
      startOpen: true,
      view: () => this.body(),
      heading: () => openDoc.value?.path ?? null,
      badges: () => this.badges(),
      close: () => {
        if (openDoc.value) void closeFile();
        else panel.hide();
      },
    });
    this.panel = panel;

    this.ide.registry('toolbar.button').add({
      id: 'editor',
      title: 'toolbar.editor',
      command: 'panel.editor',
      icon: EditorIcon,
      active: panel.open,
    });

    effect(() => {
      const path = openDoc.value?.path ?? null;
      if (path && path !== this.shown) panel.show();
      this.shown = path;
    });

    this.commands();
  }

  private commands(): void {
    const inEditor = (run: (view: EditorView) => boolean) => () => {
      if (this.view) run(this.view);
    };
    this.ide.command('edit.undo', inEditor(undo));
    this.ide.command('edit.redo', inEditor(redo));
    this.ide.command('edit.deleteLine', inEditor(deleteLine));
    this.ide.command('edit.duplicateLine', inEditor(copyLineDown));
    this.ide.command('edit.toggleComment', inEditor(toggleComment));
    this.ide.command('edit.moveLineUp', inEditor(moveLineUp));
    this.ide.command('edit.moveLineDown', inEditor(moveLineDown));
    this.ide.command('edit.addCursorAbove', inEditor(addCursorAbove));
    this.ide.command('edit.addCursorBelow', inEditor(addCursorBelow));
    this.ide.command('edit.wordLeft', inEditor(cursorGroupLeft));
    this.ide.command('edit.wordRight', inEditor(cursorGroupRight));
    this.ide.command('edit.selectWordLeft', inEditor(selectGroupLeft));
    this.ide.command('edit.selectWordRight', inEditor(selectGroupRight));
    this.ide.command('edit.indent', inEditor(indentMore));
    this.ide.command('edit.unindent', inEditor(indentLess));

    this.ide.command('symbol.goto', () => {
      const view = this.view;
      if (!view) return;
      void this.ask(view, view.state.selection.main.head);
    });
  }

  private ask(view: EditorView, at: number): Promise<void> {
    const line = view.state.doc.lineAt(at);
    const coords = view.coordsAtPos(at);
    return askSymbol({
      line: line.number - 1,
      character: at - line.from,
      text: line.text,
      box: { x: coords?.left ?? 0, y: coords?.bottom ?? 0 },
    });
  }

  private badges() {
    const file = openDoc.value;
    if (!file) return null;
    return (
      <>
        {file.truncated && <span class="tag">read-only</span>}
        {dirty.value && <span class="tag is-dirty">modified</span>}
      </>
    );
  }

  private body() {
    const file = openDoc.value;
    if (!file) return this.empty();
    const config = settings.value;
    if (!config) return null;
    return (
      <CodeEditor
        file={file}
        head={headFor(file.path)}
        onHunk={showHunk}
        externalEpoch={externalEpoch.value}
        reveal={pendingReveal.value}
        wantsFocus={wantsFocus.value}
        settings={config.editor}
        diagnostics={fileDiagnostics.value}
        onEdit={editDoc}
        onCaret={(line, character) => visit(file.path, line, character)}
        onModClick={(pos) => {
          if (this.view) void this.ask(this.view, pos);
        }}
        onHover={hover}
        onMount={(view) => (this.view = view)}
      />
    );
  }

  private empty() {
    const views = this.ide.registry<EmptyView>('editor.empty').all.value;
    if (views.length === 0) return <div class="editor-nothing">{t('editor.nothing')}</div>;
    return <>{views.map((one) => one.view() as never)}</>;
  }

  toggle(): void {
    this.panel?.toggle();
  }
}
