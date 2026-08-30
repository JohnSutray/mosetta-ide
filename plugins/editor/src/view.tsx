import { useEffect, useRef } from 'preact/hooks';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  drawSelection,
  highlightSpecialChars,
} from '@codemirror/view';
import { history } from '@codemirror/commands';
import { activeLine } from './active-line.js';
import { bracketMatching, indentOnInput, foldGutter } from '@codemirror/language';
import { highlightSelectionMatches } from '@codemirror/search';
import type { KeyBinding } from '@codemirror/view';
import type { Diagnostic, DocState, EditorSettings, HoverInfo } from '@ide/protocol';
import {
  chordHeld,
  unstable_darcula as darcula,
  unstable_inputKeymap as inputKeymap,
  unstable_languageFor as languageFor,
  takeFocusOnMount,
  unstable_textStyle as textStyle,
  type Hunk,
  type HunkBox,
} from '@ide/api/client';
import { diagnosticsExtension, setDiagnostics } from './diagnostics.js';
import { gitGutter, setHeadText } from './git-marks.js';
import { lspHover } from './hover.js';

const externalUpdate = Annotation.define<boolean>();

interface Props {
  file: DocState;
  head: string | null;
  onHunk: (hunk: Hunk, box: HunkBox) => void;
  externalEpoch: number;
  reveal: { path: string; line: number; character?: number; epoch: number } | null;
  wantsFocus: number;
  settings: EditorSettings;
  diagnostics: Diagnostic[];
  onEdit: (text: string) => void;
  onCaret: (line: number, character: number) => void;
  onModClick: (pos: number) => void;
  onHover: (path: string, line: number, character: number) => Promise<HoverInfo | null>;
  onMount: (view: EditorView | null) => void;
}

export function CodeEditor({
  file,
  head,
  onHunk,
  externalEpoch,
  reveal,
  wantsFocus,
  settings,
  diagnostics,
  onEdit,
  onCaret,
  onModClick,
  onHover,
  onMount,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onEdit, onHover, onHunk, onCaret, onModClick });
  handlers.current = { onEdit, onHover, onHunk, onCaret, onModClick };
  const pathRef = useRef(file.path);
  pathRef.current = file.path;

  useEffect(() => {
    if (!host.current) return;
    const extensions: Extension[] = [
      ...(settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
      foldGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      activeLine,
      highlightSelectionMatches(),
      keymap.of([...(inputKeymap as KeyBinding[])]),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          const at = update.state.selection.main.head;
          const line = update.state.doc.lineAt(at);
          handlers.current.onCaret(line.number - 1, at - line.from);
        }
        if (!update.docChanged) return;
        if (update.transactions.some((tr) => tr.annotation(externalUpdate))) return;
        handlers.current.onEdit(update.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        mousedown(event, view) {
          if (event.button !== 0 || !chordHeld('symbol.goto', event)) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos === null) return false;
          event.preventDefault();
          handlers.current.onModClick(pos);
          return true;
        },
      }),
      darcula as Extension,
      gitGutter((hunk, box) => handlers.current.onHunk(hunk, box)),
      diagnosticsExtension,
      lspHover(
        () => pathRef.current,
        (path, line, character) => handlers.current.onHover(path, line, character),
      ),
      EditorView.theme({
        '&': { fontSize: `${settings.fontSize}px` },
        '.cm-content': textStyle(settings),
        '.cm-cursor, .cm-dropCursor': { borderLeftWidth: `${settings.caretWidth}px` },
      }),
      EditorState.tabSize.of(settings.tabSize),
      languageFor(file.path) as Extension,
      EditorState.readOnly.of(file.truncated),
    ];

    const instance = new EditorView({
      state: EditorState.create({ doc: file.text, extensions }),
      parent: host.current,
    });
    instance.dispatch({ effects: setHeadText.of(head) });
    view.current = instance;
    onMount(instance);
    if (takeFocusOnMount()) instance.focus();

    return () => {
      onMount(null);
      instance.destroy();
      view.current = null;
    };
  }, [file.path, settings.fontSize, settings.fontFamily, settings.tabSize, settings.lineNumbers, settings.caretWidth]);

  useEffect(() => {
    view.current?.dispatch({ effects: setDiagnostics.of(diagnostics) });
  }, [diagnostics]);

  useEffect(() => {
    view.current?.dispatch({ effects: setHeadText.of(head) });
  }, [head]);

  useEffect(() => {
    const instance = view.current;
    if (!instance || externalEpoch === 0) return;
    const current = instance.state.doc.toString();
    if (current === file.text) return;
    const head = instance.state.selection.main.head;
    instance.dispatch({
      changes: { from: 0, to: instance.state.doc.length, insert: file.text },
      selection: { anchor: Math.min(head, file.text.length) },
      annotations: externalUpdate.of(true),
    });
  }, [externalEpoch]);

  const focusSeen = useRef(wantsFocus);
  useEffect(() => {
    if (wantsFocus === focusSeen.current) return;
    focusSeen.current = wantsFocus;
    view.current?.focus();
  }, [wantsFocus]);

  useEffect(() => {
    const instance = view.current;
    if (!instance || !reveal || reveal.path !== file.path) return;
    const line = instance.state.doc.line(Math.min(reveal.line + 1, instance.state.doc.lines));
    const at = Math.min(line.from + (reveal.character ?? 0), line.to);
    instance.dispatch({
      selection: { anchor: at },
      scrollIntoView: true,
      effects: EditorView.scrollIntoView(at, { y: 'center' }),
    });
    instance.focus();
  }, [reveal?.epoch, file.path]);

  return <div class="editor" data-keys="editor" ref={host} />;
}
