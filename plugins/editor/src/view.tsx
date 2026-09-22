import { useEffect, useRef } from 'preact/hooks';
import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  drawSelection,
  tooltips,
  highlightSpecialChars,
} from '@codemirror/view';
import { history } from '@codemirror/commands';
import { activeLine } from './active-line.js';
import { bracketMatching, indentOnInput, foldGutter } from '@codemirror/language';
import { highlightSelectionMatches } from '@codemirror/search';
import type { DocState } from '@mosetta/ide-protocol';
import type CodePlugin from '@mosetta/ide-plugin-code';
import type { EditorSettings, Hunk } from '@mosetta/ide-plugin-code';
import type { Diagnostic, HoverInfo } from '@mosetta/ide-plugin-lsp';
import { type HunkBox } from '@mosetta/ide-api/client';
import { diagnosticsExtension, setDiagnostics } from './diagnostics.js';
import { setHeadText, type GitMarks } from './git-marks.js';
import { lspHover } from './hover.js';
import type { HoverSource } from './schema.js';

/**
 * CodeMirror's tooltip layer.
 *
 * CodeMirror puts a container of its own, carrying the editor theme's classes, into its
 * parent, and the theme's root is `height: 100%`. Placed straight into `body`, the
 * empty container stood in the flow below the IDE's root with the height of the window,
 * and the page scrolled by a second screenful. In a zero-sized `fixed` layer the
 * container is zero-sized and out of the flow, while the tooltips inside it stay
 * `fixed` — measured from the window, as they need to be. There is one layer per
 * document: it is found by id rather than held in a variable. It carries the IDE's root
 * class, because the IDE's styles hang from that class and the tooltips live outside
 * the root.
 */
class TooltipLayer {
  private readonly id = 'cm-tooltip-layer';

  host(doc: Document): HTMLElement {
    const known = doc.getElementById(this.id);
    if (known) return known;
    const layer = doc.createElement('div');
    layer.id = this.id;
    layer.className = 'mosetta-ide';
    layer.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 200;';
    doc.body.append(layer);
    return layer;
  }
}

const tooltipLayer = new TooltipLayer();

/**
 * A mark saying "the text was replaced from outside". Without it, replacing the
 * document would fly back to the server as an ordinary user edit.
 */
const externalUpdate = Annotation.define<boolean>();

interface Props {
  file: DocState;
  /** What the file was in the commit: the git strips are computed from it. */
  head: string | null;
  onHunk: (hunk: Hunk, box: HunkBox) => void;
  /** The open number: a change means a new editor, a file moving means the same one. */
  docKey: number;
  externalEpoch: number;
  /** Where to jump: a line from the symbol search. */
  reveal: { path: string; line: number; character?: number; epoch: number } | null;
  /**
   * A request to move the keyboard here — as a COUNTER. Needed where the file is
   * already open: the editor is not born again, and the focus-on-birth mark has nothing
   * to fire on.
   */
  wantsFocus: number;
  settings: EditorSettings;
  diagnostics: Diagnostic[];
  onEdit: (text: string) => void;
  /**
   * The keyboard left the text. What that means is not the editor's decision: it
   * reports a FACT, as it does about the caret — and the document, if the user asked
   * for it, writes itself to disk.
   */
  onBlur: () => void;
  /** The caret landed somewhere (line and column, zero-based). Called often. */
  onCaret: (line: number, character: number) => void;
  /**
   * A click with the go-to-symbol chord. What it means is unknown to the editor — it
   * only reports where the click landed.
   */
  onModClick: (pos: number) => void;
  onHover: (path: string, line: number, character: number) => Promise<HoverInfo | null>;
  /** Who else answers a hover — the entries of the `editor.hover` key. */
  hoverSources: () => readonly HoverSource[];
  onMount: (view: EditorView | null) => void;
  /** The neighbours' extensions from the `editor.extension` key. */
  extra: Extension[];
  /** The code display is a neighbour: the look, the languages, the input mechanics. */
  code: CodePlugin;
  /** This editor's git strips: computed by the code display's diff. */
  marks: GitMarks;
  /** Whether to take the keyboard on birth — we ask the documents. */
  takeFocus: () => boolean;
  /** Whether the command chord was held during the click — we ask the keymap. */
  chordHeld: (command: string, event: MouseEvent) => boolean;
}

/**
 * The wrapper around CodeMirror.
 *
 * There are no keys of its own here and there cannot be: Cmd+S, Cmd+Z and all the rest
 * arrive from the keymap through the dispatcher, and the editor merely hands its
 * `EditorView` outwards for the commands to work on. Of the foreign bindings only the
 * INPUT mechanics are kept — the arrows, Backspace, newline, Cmd+A. `defaultKeymap`
 * used to stand here whole, and along with the mechanics it brought a dozen foreign
 * commands on top of our keys.
 *
 * The buffer's text is not mirrored upwards: there is one owner, CodeMirror's state.
 */
export function CodeEditor({
  file,
  docKey,
  head,
  onHunk,
  externalEpoch,
  reveal,
  wantsFocus,
  settings,
  diagnostics,
  onEdit,
  onBlur,
  onCaret,
  onModClick,
  onHover,
  hoverSources,
  onMount,
  extra,
  code,
  marks,
  takeFocus,
  chordHeld,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onEdit, onBlur, onHover, hoverSources, onHunk, onCaret, onModClick });
  handlers.current = { onEdit, onBlur, onHover, hoverSources, onHunk, onCaret, onModClick };
  const pathRef = useRef(file.path);
  pathRef.current = file.path;
  const language = useRef(new Compartment());
  const extras = useRef(new Compartment());

  useEffect(() => {
    if (!host.current) return;
    const extensions: Extension[] = [
      ...(settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
      foldGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      tooltips({ parent: tooltipLayer.host(document) }),
      indentOnInput(),
      bracketMatching(),
      activeLine,
      highlightSelectionMatches(),
      keymap.of([...code.input.keymap]),
      EditorView.updateListener.of((update) => {
        if (update.focusChanged && !update.view.hasFocus) handlers.current.onBlur();
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
      code.look.extension,
      marks.gutter((hunk, box) => handlers.current.onHunk(hunk, box)),
      diagnosticsExtension,
      lspHover(
        () => pathRef.current,
        (path, line, character) => handlers.current.onHover(path, line, character),
        code,
        () => handlers.current.hoverSources(),
      ),
      EditorView.theme({
        '&': { fontSize: `${settings.fontSize}px` },
        '.cm-content': code.look.textStyle(settings),
        '.cm-cursor, .cm-dropCursor': { borderLeftWidth: `${settings.caretWidth}px` },
      }),
      EditorState.tabSize.of(settings.tabSize),
      language.current.of(code.languages.of(file.path)),
      EditorState.readOnly.of(file.truncated),
      extras.current.of(extra),
    ];

    const instance = new EditorView({
      state: EditorState.create({ doc: file.text, extensions }),
      parent: host.current,
    });
    instance.dispatch({ effects: setHeadText.of(head) });
    view.current = instance;
    onMount(instance);
    if (takeFocus()) instance.focus();

    return () => {
      onMount(null);
      instance.destroy();
      view.current = null;
    };
  }, [docKey, settings.fontSize, settings.fontFamily, settings.tabSize, settings.lineNumbers, settings.caretWidth]);

  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(code.languages.of(file.path)) });
  }, [file.path]);

  useEffect(() => {
    view.current?.dispatch({ effects: extras.current.reconfigure(extra) });
  }, [extra]);

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
