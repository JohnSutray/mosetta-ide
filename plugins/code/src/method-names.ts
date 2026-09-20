import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/**
 * Method names are yellow, like functions.
 *
 * The JS/TS grammar marks a field's name and a method's name with ONE tag,
 * `definition(propertyName)`, and Darcula painted both purple — the colour of a field.
 * In IDEA a method declaration is yellow, like `function fun()`. Adding a tag to the
 * grammar by position in the tree is impossible: when merging rules, lezer puts the
 * context-free rule first, and it always wins. So the mark goes around the tags, by the
 * tree itself: a `PropertyDefinition` inside a `MethodDeclaration` gets a class, and
 * the theme gives it a colour. Only what is visible: the tree is parsed anyway, and
 * walking it costs less than drawing.
 */
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
