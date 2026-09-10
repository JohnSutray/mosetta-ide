import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, gutter, GutterMarker } from '@codemirror/view';
import type { HunkBox } from '@ide/api/client';
import type { Hunk, LineDiff } from '@ide/plugin-code';

export const setHeadText = StateEffect.define<string | null>();

interface GitLines {
  head: string | null;
  hunks: Hunk[];
}

const EMPTY: GitLines = { head: null, hunks: [] };

function linesFieldOf(diff: LineDiff) {
  return StateField.define<GitLines>({
    create() {
      return EMPTY;
    },
    update(value, tr) {
      let head = value.head;
      let changed = false;
      for (const effect of tr.effects) {
        if (!effect.is(setHeadText)) continue;
        head = effect.value;
        changed = true;
      }
      if (!changed && !tr.docChanged) return value;
      if (head === null) return value.hunks.length === 0 && value.head === null ? value : { head, hunks: [] };
      return { head, hunks: diff.hunks(head, tr.state.doc.toString()) };
    },
  });
}

class Mark extends GutterMarker {
  constructor(private readonly kind: Hunk['kind']) {
    super();
  }

  override eq(other: Mark): boolean {
    return other.kind === this.kind;
  }

  override toDOM(): Node {
    const el = document.createElement('div');
    el.className = `cm-gitmark is-${this.kind}`;
    return el;
  }
}

const MARKS = {
  added: new Mark('added'),
  modified: new Mark('modified'),
  removed: new Mark('removed'),
};

function boxOf(view: EditorView, hunk: Hunk, event: MouseEvent): HunkBox {
  const doc = view.state.doc;
  const first = view.coordsAtPos(doc.line(Math.min(hunk.from, doc.lines)).from);
  const last = view.coordsAtPos(doc.line(Math.min(hunk.to, doc.lines)).to);
  if (!first || !last) return { left: event.clientX, top: event.clientY, bottom: event.clientY };
  return { left: view.dom.getBoundingClientRect().left, top: first.top, bottom: last.bottom };
}

export class GitMarks {
  private readonly field: StateField<GitLines>;

  constructor(diff: LineDiff) {
    this.field = linesFieldOf(diff);
  }

  at(hunks: Hunk[], line: number): Hunk | null {
    for (const hunk of hunks) {
      if (line >= hunk.from && line <= hunk.to) return hunk;
    }
    return null;
  }

  gutter(onClick: (hunk: Hunk, at: HunkBox) => void): Extension {
    return [
      this.field,
      gutter({
        class: 'cm-gitgutter',
        lineMarker: (view, block) => {
          const { hunks } = view.state.field(this.field);
          if (hunks.length === 0) return null;
          const line = view.state.doc.lineAt(block.from).number;
          const hunk = this.at(hunks, line);
          return hunk ? MARKS[hunk.kind] : null;
        },
        lineMarkerChange: (update) => {
          return update.docChanged || update.startState.field(this.field) !== update.state.field(this.field);
        },
        domEventHandlers: {
          mousedown: (view, block, event) => {
            const { hunks } = view.state.field(this.field);
            const line = view.state.doc.lineAt(block.from).number;
            const hunk = this.at(hunks, line);
            if (!hunk) return false;
            onClick(hunk, boxOf(view, hunk, event as MouseEvent));
            return true;
          },
        },
      }),

    ];
  }

  revert(view: EditorView, hunk: Hunk): void {
    const doc = view.state.doc;
    const restored = hunk.before.join('\n');

    if (hunk.kind === 'added') {
      const from = doc.line(Math.min(hunk.from, doc.lines)).from;
      const last = doc.line(Math.min(hunk.to, doc.lines));
      const to = Math.min(last.to + 1, doc.length);
      view.dispatch({ changes: { from, to, insert: '' } });
      return;
    }

    if (hunk.kind === 'modified') {
      const from = doc.line(Math.min(hunk.from, doc.lines)).from;
      const to = doc.line(Math.min(hunk.to, doc.lines)).to;
      view.dispatch({ changes: { from, to, insert: restored } });
      return;
    }

    if (hunk.from > doc.lines) {
      view.dispatch({ changes: { from: doc.length, to: doc.length, insert: `\n${restored}` } });
      return;
    }
    const at = doc.line(hunk.from).from;
    view.dispatch({ changes: { from: at, to: at, insert: `${restored}\n` } });
  }
}
