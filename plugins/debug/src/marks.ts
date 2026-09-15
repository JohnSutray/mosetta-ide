import { RangeSet, StateEffect, StateField, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutter, type DecorationSet } from '@codemirror/view';
import type { Breakpoint, BreakpointAsk } from './types.js';

export const setBreakpoints = StateEffect.define<Breakpoint[]>();
export const setExecution = StateEffect.define<number | null>();

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
        if (one.line < 1 || one.line > tr.state.doc.lines) continue;
        ranges.push(new Mark(one.verified, kindOf(one), one).range(tr.state.doc.line(one.line).from));
      }
      ranges.sort((a, b) => a.from - b.from);
      next = RangeSet.of(ranges, true);
    }
    return next;
  },
});

function survive(value: RangeSet<Mark>, tr: Transaction): RangeSet<Mark> {
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
  attached(view: EditorView | null): void;
  toggled(view: EditorView, line: number): void;
  menu(view: EditorView, line: number, at: { x: number; y: number }): void;
  moved(view: EditorView, asks: BreakpointAsk[]): void;
}

export class DebugMarks {
  constructor(private readonly listener: MarksListener) {}

  lines(state: EditorState): number[] {
    return this.asks(state).map((one) => one.line);
  }

  asks(state: EditorState): BreakpointAsk[] {
    const out = new Map<number, BreakpointAsk>();
    const iter = state.field(breakpointsField).iter();
    while (iter.value) {
      const line = state.doc.lineAt(iter.from).number;
      if (!out.has(line)) {
        const { condition, hitCondition, logMessage } = iter.value.ask;
        out.set(line, {
          line,
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
