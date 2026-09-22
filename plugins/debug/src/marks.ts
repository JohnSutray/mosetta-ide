import { RangeSet, StateEffect, StateField, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutter, type DecorationSet } from '@codemirror/view';
import { anchors } from './anchors.js';
import type { Breakpoint, BreakpointAsk } from './types.js';

/**
 * Debugging in the editor: the breakpoints in the gutter on the left, and the line we
 * are standing on. A CodeMirror extension; it enters through the `editor.extension` key
 * — the live `EditorView` is not handed outwards, the extension takes it itself.
 *
 * A breakpoint is a POSITION in the text rather than a line number: type a line above
 * it and the breakpoint has travelled with the code, like the git strips. The numbers
 * are computed from the positions at the moment they are asked for, and that is when
 * they travel to the server.
 */

export const setBreakpoints = StateEffect.define<Breakpoint[]>();
/** The line being executed, from one; `null` means we are not standing. */
export const setExecution = StateEffect.define<number | null>();

/**
 * What kind of breakpoint: an ordinary one, one with a condition, a printing one (a
 * logpoint).
 */
type Kind = 'plain' | 'conditional' | 'log';

function kindOf(one: Breakpoint): Kind {
  if (one.logMessage) return 'log';
  if (one.condition || one.hitCondition) return 'conditional';
  return 'plain';
}

class Mark extends GutterMarker {
  constructor(
    readonly verified: boolean,
    readonly kind: Kind,
    /** What was asked for — so that it can be returned to the edit window as it is. */
    readonly ask: Breakpoint,
  ) {
    super();
  }

  override eq(other: Mark): boolean {
    return (
      other.verified === this.verified &&
      other.kind === this.kind &&
      other.ask.condition === this.ask.condition &&
      other.ask.hitCondition === this.ask.hitCondition &&
      other.ask.logMessage === this.ask.logMessage
    );
  }

  override toDOM(): Node {
    const el = document.createElement('div');
    el.className = `cm-breakpoint ${this.verified ? 'is-verified' : 'is-pending'} is-${this.kind}`;
    const tip = [this.ask.condition, this.ask.hitCondition && `hits ${this.ask.hitCondition}`, this.ask.logMessage]
      .filter(Boolean)
      .join(' · ');
    if (tip) el.title = tip;
    return el;
  }
}

const SPACER = new Mark(false, 'plain', { line: 0, verified: false });

const breakpointsField = StateField.define<RangeSet<Mark>>({
  create() {
    return RangeSet.empty;
  },
  update(value, tr) {
    let next = tr.docChanged ? survive(value, tr) : value;
    for (const effect of tr.effects) {
      if (!effect.is(setBreakpoints)) continue;
      const ranges = [];
      for (const one of effect.value) {
        if (one.line < 1 && !one.anchor) continue;
        const line = lineFor(tr.state, one);
        if (line < 1 || line > tr.state.doc.lines) continue;
        ranges.push(new Mark(one.verified, kindOf(one), { ...one, line }).range(tr.state.doc.line(line).from));
      }
      ranges.sort((a, b) => a.from - b.from);
      next = RangeSet.of(ranges, true);
    }
    return next;
  },
});

/** Where this breakpoint is in THIS text: by its anchor, if it has one. */
function lineFor(state: EditorState, one: BreakpointAsk): number {
  if (!one.anchor) return one.line;
  return anchors.find((line) => state.doc.line(line).text, state.doc.lines, one.anchor, one.line);
}

/**
 * The text has been replaced WHOLE — that is not an edit but a different text.
 *
 * Re-read from disk, somebody else's edit pulled in, a hunk reverted: the editor
 * receives one replacement from beginning to end. To the rule "the line was erased —
 * the breakpoint is gone" that looks like the erasing of EVERY line at once, and the
 * breakpoints disappeared to the last one — and then an empty list travelled to the
 * server, so they were lost for real. Here their place is found by the anchor.
 */
function replacedWhole(tr: Transaction): boolean {
  let changes = 0;
  let whole = false;
  tr.changes.iterChangedRanges((fromA, toA) => {
    changes += 1;
    if (fromA === 0 && toA === tr.startState.doc.length && toA > fromA) whole = true;
  });
  return changes === 1 && whole;
}

/**
 * The breakpoints after the whole text was replaced: each looks for its own line by the
 * anchor.
 */
function reanchor(value: RangeSet<Mark>, tr: Transaction): RangeSet<Mark> {
  const ranges = [];
  const iter = value.iter();
  while (iter.value) {
    const was = tr.startState.doc.lineAt(iter.from).number;
    const ask = { ...iter.value.ask, line: was };
    const line = lineFor(tr.state, ask);
    if (line >= 1 && line <= tr.state.doc.lines) {
      ranges.push(new Mark(false, iter.value.kind, { ...ask, line }).range(tr.state.doc.line(line).from));
    }
    iter.next();
  }
  ranges.sort((a, b) => a.from - b.from);
  return RangeSet.of(ranges, true);
}

/**
 * The breakpoints after an edit: they travel with the text, and a breakpoint on an
 * ERASED line disappears. A bare `map` would leave it where it was — and it would stick
 * to the neighbouring line, where the user never put it.
 */
function survive(value: RangeSet<Mark>, tr: Transaction): RangeSet<Mark> {
  if (replacedWhole(tr)) return reanchor(value, tr);
  const gone = new Set<number>();
  const iter = value.iter();
  while (iter.value) {
    const line = tr.startState.doc.lineAt(iter.from);
    const end = Math.min(line.to + 1, tr.startState.doc.length);
    tr.changes.iterChangedRanges((fromA, toA) => {
      if (fromA <= line.from && toA >= end && toA > fromA) gone.add(iter.from);
    });
    iter.next();
  }
  if (gone.size === 0) return value.map(tr.changes);
  return value.update({ filter: (from) => !gone.has(from) }).map(tr.changes);
}

const executionLine = Decoration.line({ class: 'cm-execution-line' });

/**
 * The position of the line being executed: it travels with the edits, like the
 * breakpoints.
 */
const executionField = StateField.define<number | null>({
  create() {
    return null;
  },
  update(value, tr) {
    let next = value === null ? null : tr.changes.mapPos(value);
    for (const effect of tr.effects) {
      if (!effect.is(setExecution)) continue;
      const line = effect.value;
      next = line === null || line < 1 || line > tr.state.doc.lines ? null : tr.state.doc.line(line).from;
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.compute([field], (state): DecorationSet => {
      const at = state.field(field);
      if (at === null) return Decoration.none;
      return Decoration.set([executionLine.range(state.doc.lineAt(at).from)]);
    }),
});

export interface MarksListener {
  /**
   * An editor has been born or has died: this is where the breakpoints and the line
   * being executed are sent.
   */
  attached(view: EditorView | null): void;
  /** The gutter was clicked on this line (from one). */
  toggled(view: EditorView, line: number): void;
  /** The right button on the gutter: a breakpoint's menu — condition, log, remove. */
  menu(view: EditorView, line: number, at: { x: number; y: number }): void;
  /** The text was edited and the breakpoints have travelled: here is where they are now. */
  moved(view: EditorView, asks: BreakpointAsk[]): void;
}

export class DebugMarks {
  constructor(private readonly listener: MarksListener) {}

  /**
   * The line numbers with breakpoints — from the POSITIONS rather than from what was
   * sent in.
   */
  lines(state: EditorState): number[] {
    return this.asks(state).map((one) => one.line);
  }

  /**
   * The breakpoints as requests — with their conditions, but with their PRESENT line
   * numbers.
   */
  asks(state: EditorState): BreakpointAsk[] {
    const out = new Map<number, BreakpointAsk>();
    const iter = state.field(breakpointsField).iter();
    while (iter.value) {
      const line = state.doc.lineAt(iter.from).number;
      if (!out.has(line)) {
        const { condition, hitCondition, logMessage } = iter.value.ask;
        out.set(line, {
          line,
          ...(anchors.of(state.doc.line(line).text) ? { anchor: anchors.of(state.doc.line(line).text) } : {}),
          ...(condition ? { condition } : {}),
          ...(hitCondition ? { hitCondition } : {}),
          ...(logMessage ? { logMessage } : {}),
        });
      }
      iter.next();
    }
    return [...out.values()].sort((a, b) => a.line - b.line);
  }

  extension(): Extension {
    const listener = this.listener;
    const marks = this;
    return [
      breakpointsField,
      executionField,
      gutter({
        class: 'cm-debug-gutter',
        markers: (view) => view.state.field(breakpointsField),
        initialSpacer: () => SPACER,
        domEventHandlers: {
          mousedown: (view, block, event) => {
            const mouse = event as MouseEvent;
            const line = view.state.doc.lineAt(block.from).number;
            if (mouse.button === 2) {
              listener.menu(view, line, { x: mouse.clientX, y: mouse.clientY });
              return true;
            }
            if (mouse.button !== 0) return false;
            listener.toggled(view, line);
            return true;
          },
          contextmenu: (_view, _block, event) => {
            event.preventDefault();
            return true;
          },
        },
      }),
      ViewPlugin.define((view) => {
        queueMicrotask(() => listener.attached(view));
        let before = marks.lines(view.state);
        return {
          update(update) {
            const now = marks.lines(update.state);
            if (!update.docChanged) {
              before = now;
              return;
            }
            if (same(before, now)) return;
            before = now;
            listener.moved(update.view, marks.asks(update.state));
          },
          destroy() {
            listener.attached(null);
          },
        };
      }),
      EditorView.baseTheme({
        '.cm-execution-line': { backgroundColor: 'var(--debug-line)' },
      }),
    ];
  }
}

function same(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((line, at) => line === b[at]);
}
