import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { Diagnostic, Severity } from '@ide/protocol';
import { darcula } from '@ide/code';

const dc = darcula.palette;

export const setDiagnostics = StateEffect.define<Diagnostic[]>();

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
  '.cm-diag': { textDecoration: `underline wavy ${dc.errorFg}`, textUnderlineOffset: '3px' },
  '.cm-diag-error': { textDecorationColor: dc.errorFg },
  '.cm-diag-warning': { textDecorationColor: dc.warnFg },
  '.cm-diag-info': { textDecorationColor: dc.number },
  '.cm-diag-hint': { textDecorationColor: dc.comment },
});

export const diagnosticsExtension: Extension = [diagnosticsField, diagnosticsTheme];

export class Diagnostics {
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

export const diagnostics = new Diagnostics();
