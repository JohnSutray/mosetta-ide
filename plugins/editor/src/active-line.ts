import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/**
 * Highlighting the current line, which gets out of the way of a selection.
 *
 * Ours, because the other one (`highlightActiveLine` from CodeMirror) paints the line
 * with the caret ALWAYS — including when something on that line is selected. The
 * selection layer lies UNDER the text while a line's background is on the text itself,
 * and an opaque background covers the selection entirely.
 *
 * From the outside this looked like: Shift+arrow works — the caret moves, the text is
 * selected, it copies — but NOTHING is visible. And a mouse selection across several
 * lines is visible, because the other lines are not the current one. Half a day went on
 * "Shift+arrow does not work for me", when what was broken was one piece of paint.
 *
 * The rule is the same as in IDEA: if there is a selection, there is no line highlight.
 * The caret is visible anyway, and the selection matters more.
 */

const lineDeco = Decoration.line({ class: 'cm-activeLine' });

export const activeLine = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = deco(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) this.decorations = deco(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function deco(view: EditorView): DecorationSet {
  let lastLine = -1;
  const out = [];
  for (const range of view.state.selection.ranges) {
    if (!range.empty) continue;
    const line = view.lineBlockAt(range.head);
    if (line.from > lastLine) {
      out.push(lineDeco.range(line.from));
      lastLine = line.from;
    }
  }
  return Decoration.set(out);
}
