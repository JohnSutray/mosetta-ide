import { useEffect, useRef } from 'preact/hooks';
import { EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, lineNumbers, highlightSpecialChars } from '@codemirror/view';
import type { EditorSettings } from './settings.js';
import type { CodeLook } from './look.js';
import type { Languages } from './languages.js';

/** What to show; the look and the languages are supplied by the plugin. */
export interface CodeViewProps {
  path: string;
  text: string;
  /**
   * The line all this is being shown for, zero-based. −1 means simply the start of the
   * file.
   */
  line: number;
  settings: EditorSettings;
}

/**
 * Show a file — always by one and the same means.
 *
 * The search preview used to be drawn by hand: a `<pre>` with line numbers and not one
 * colour. The result was two different "editors" in one application, the one people
 * edit in and the one they look in — and the second knew nothing about the language or
 * about the scheme.
 *
 * Here is the same CodeMirror with the same Darcula and the same highlighting by
 * extension. There is exactly one difference and it is deliberate: it is NOT EDITABLE,
 * so focus stays with whoever showed it (the search field, for instance) and the arrows
 * keep walking the list.
 */
export function CodeView({
  path,
  text,
  line,
  settings,
  look,
  languages,
}: CodeViewProps & { look: CodeLook; languages: Languages }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const extensions: Extension[] = [
      lineNumbers(),
      highlightSpecialChars(),
      languages.of(path),
      look.extension,
      hitLine,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.theme({
        '&': { fontSize: `${settings.fontSize}px`, height: '100%' },
        '.cm-content': look.textStyle(settings),
        '.cm-scroller': { overflow: 'auto' },
      }),
    ];

    const view = new EditorView({
      state: EditorState.create({ doc: text, extensions }),
      parent: host.current,
    });

    if (line >= 0) {
      const at = view.state.doc.line(Math.min(line + 1, view.state.doc.lines)).from;
      view.dispatch({
        selection: { anchor: at },
        effects: EditorView.scrollIntoView(at, { y: 'center' }),
      });
    }

    return () => view.destroy();
  }, [path, text, line, settings.fontSize, settings.fontFamily]);

  return <div class="code-view" ref={host} />;
}

/** Highlighting that one line: the same role as the active line in the editor. */
const hitLine = EditorView.decorations.compute(['selection'], (state) => {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return Decoration.set([Decoration.line({ class: 'cm-hit-line' }).range(line.from)]);
});
