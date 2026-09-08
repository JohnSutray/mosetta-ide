import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

export class MethodNames {
  readonly className = 'cm-method-name';
  private readonly mark = Decoration.mark({ class: this.className });

  readonly extension = ViewPlugin.fromClass(
    (() => {
      const names = this;
      return class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = names.paint(view);
        }
        update(update: ViewUpdate): void {
          if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
            this.decorations = names.paint(update.view);
          }
        }
      };
    })(),
    { decorations: (plugin) => plugin.decorations },
  );

  private paint(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const tree = syntaxTree(view.state);
    for (const { from, to } of view.visibleRanges) {
      tree.iterate({
        from,
        to,
        enter: (node) => {
          if (node.name !== 'PropertyDefinition' || node.node.parent?.name !== 'MethodDeclaration') return;
          builder.add(node.from, node.to, this.mark);
        },
      });
    }
    return builder.finish();
  }
}

export const methodNames = new MethodNames();
