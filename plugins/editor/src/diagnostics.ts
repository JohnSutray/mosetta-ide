import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { Diagnostic, Severity } from '@mosetta/ide-plugin-lsp';

/**
 * Underlining errors with our own decorations rather than through `@codemirror/lint`.
 *
 * The reason is the same one CodeMirror was chosen for: somebody else's package would
 * bring its own panel, its own keys and its own idea of a tooltip, and we would start
 * tearing that off. Everything visible here is drawn by us.
 */

export const setDiagnostics = StateEffect.define<Diagnostic[]>();

/**
 * An error's text travels TOGETHER with its underline.
 *
 * Not as a separate list: while the server thinks about new diagnostics, the old ones
 * travel through the text along with the edits — CodeMirror can move decorations
 * itself. A raw list cannot, and the tooltip would be showing an error that had slipped
 * by a couple of characters.
 */
function mark(item: Diagnostic) {
  return Decoration.mark({
    class: `cm-diag cm-diag-${item.severity}`,
    message: item.message,
    severity: item.severity,
  });
}

export const diagnosticsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setDiagnostics)) continue;
      next = build(effect.value, tr.state.doc);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function build(list: Diagnostic[], doc: { lines: number; line(n: number): { from: number; to: number } }) {
  const ranges = [];
  for (const item of list) {
    const from = diagnostics.offsetOf(doc, item.range.start.line, item.range.start.character);
    const to = diagnostics.offsetOf(doc, item.range.end.line, item.range.end.character);
    if (from === null || to === null) continue;
    const end = to > from ? to : Math.min(from + 1, doc.line(doc.lines).to);
    if (end <= from) continue;
    ranges.push(mark(item).range(from, end));
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

export const diagnosticsTheme = EditorView.theme({
  '.cm-diag': { textDecoration: 'underline wavy var(--error)', textUnderlineOffset: '3px' },
  '.cm-diag-error': { textDecorationColor: 'var(--error)' },
  '.cm-diag-warning': { textDecorationColor: 'var(--warning)' },
  '.cm-diag-info': { textDecorationColor: 'var(--info)' },
  '.cm-diag-hint': { textDecorationColor: 'var(--hint)' },
});

export const diagnosticsExtension: Extension = [diagnosticsField, diagnosticsTheme];

/** Diagnostics in the editor: a wave under the text, and the caret landing in it. */
export class Diagnostics {
  /** Which errors stand at this place. Empty means the place is clean. */
  at(
    state: EditorState,
    pos: number,
  ): Array<{ message: string; severity: Severity }> {
    const found: Array<{ message: string; severity: Severity }> = [];
    state.field(diagnosticsField).between(pos, pos, (_from, _to, value) => {
      const spec = value.spec as { message?: string; severity?: Severity };
      if (spec.message) found.push({ message: spec.message, severity: spec.severity ?? 'error' });
    });
    return found;
  }

  /**
   * LSP speaks in lines and characters, CodeMirror in offsets. The position may not
   * exist: the server answers about a version of the text we have already retyped —
   * that is normal rather than a reason to fall over.
   */
  offsetOf(
    doc: { lines: number; line(n: number): { from: number; to: number } },
    line: number,
    character: number,
  ): number | null {
    if (line < 0 || line >= doc.lines) return null;
    const target = doc.line(line + 1);
    return Math.min(target.from + character, target.to);
  }
}

/** One per plugin: the marks themselves live in a CodeMirror state field. */
export const diagnostics = new Diagnostics();
