import { useEffect, useRef } from 'preact/hooks';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
} from '@codemirror/view';
import { defaultKeymap, history, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, foldGutter } from '@codemirror/language';
import { highlightSelectionMatches } from '@codemirror/search';
import type { Diagnostic, DocState, EditorSettings, HoverInfo } from '@ide/protocol';
import { darcula } from './darcula.js';
import { languageFor } from './languages.js';
import { diagnosticsExtension, setDiagnostics } from './diagnostics.js';
import { lspHover } from './hover.js';

const externalUpdate = Annotation.define<boolean>();

interface Props {
  file: DocState;
  externalEpoch: number;
  settings: EditorSettings;
  diagnostics: Diagnostic[];
  onEdit: (text: string) => void;
  onHover: (path: string, line: number, character: number) => Promise<HoverInfo | null>;
  onMount: (view: EditorView | null) => void;
}

export function Editor({
  file,
  externalEpoch,
  settings,
  diagnostics,
  onEdit,
  onHover,
  onMount,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onEdit, onHover });
  handlers.current = { onEdit, onHover };
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
      rectangularSelection(),
      crosshairCursor(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([...defaultKeymap, indentWithTab]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (update.transactions.some((tr) => tr.annotation(externalUpdate))) return;
        handlers.current.onEdit(update.state.doc.toString());
      }),
      darcula,
      diagnosticsExtension,
      lspHover(
        () => pathRef.current,
        (path, line, character) => handlers.current.onHover(path, line, character),
      ),
      EditorView.theme({
        '&': { fontSize: `${settings.fontSize}px` },
        '.cm-content': { fontFamily: `'${settings.fontFamily}', monospace` },
        '.cm-cursor, .cm-dropCursor': { borderLeftWidth: `${settings.caretWidth}px` },
      }),
      EditorState.tabSize.of(settings.tabSize),
      languageFor(file.path),
      EditorState.readOnly.of(file.truncated),
    ];

    const instance = new EditorView({
      state: EditorState.create({ doc: file.text, extensions }),
      parent: host.current,
    });
    view.current = instance;
    onMount(instance);
    instance.focus();

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

  return <div class="editor" ref={host} />;
}
