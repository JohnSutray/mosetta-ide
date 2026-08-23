import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

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
