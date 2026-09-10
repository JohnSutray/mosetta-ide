import { useEffect, useRef } from 'preact/hooks';
import { EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, lineNumbers, highlightSpecialChars } from '@codemirror/view';
import type { EditorSettings } from './settings.js';
import type { CodeLook } from './look.js';
import type { Languages } from './languages.js';

export interface CodeViewProps {
  path: string;
  text: string;
  line: number;
  settings: EditorSettings;
}

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

const hitLine = EditorView.decorations.compute(['selection'], (state) => {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return Decoration.set([Decoration.line({ class: 'cm-hit-line' }).range(line.from)]);
});
