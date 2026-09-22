import { EditorView, ViewPlugin, showTooltip, type Tooltip, type ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField, type ChangeSpec, type EditorState, type Extension } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { effect } from '@preact/signals';
import type { Position } from '@mosetta/ide-plugin-lsp';
import type { ChoiceHistory } from './history.js';
import type { CompletionSession } from './session.js';
import type { Ask, Details } from './types.js';

const WORD_CHAR = /[\w$]/;
const WORD_START = /[A-Za-z_$]/;
const WORD = /^[\w$]*$/;
/**
 * Where the list does not open by itself: a comment, a string, a regex. By key,
 * everywhere.
 */
const QUIET = /Comment|String|RegExp/;

/** Where the list is visible and has something to choose — then the keys are its. */
interface Shown {
  pos: number;
  keys: boolean;
}

/**
 * The bridge to CodeMirror — the one file of the plugin that knows it. Positioning,
 * flipping at the bottom edge and scrolling with the text come from `showTooltip`;
 * inside is our list. The bridge decides three things: when to open, when to close and
 * how to insert.
 *
 * While the list is visible, the editor's field calls itself `completion editor`: the
 * arrows, Enter, Tab and Escape belong to the list, everything else to the editor.
 * There are no key handlers of its own here — only the surface's name.
 */
export class CompletionBridge {
  private view: EditorView | null = null;
  private unwatch: (() => void) | null = null;
  private readonly show = StateEffect.define<Shown | null>();
  private readonly shown: StateField<Shown | null>;
  /**
   * The same tooltip while the place is the same: a new one means new DOM and a lost
   * scroll position.
   */
  private placed: Tooltip | null = null;

  constructor(
    private readonly session: CompletionSession,
    private readonly history: ChoiceHistory,
    private readonly pathOf: () => string | null,
    private readonly auto: () => boolean,
    /** Draw the list into an element; returns a teardown. */
    private readonly mount: (dom: HTMLElement) => () => void,
  ) {
    const show = this.show;
    this.shown = StateField.define<Shown | null>({
      create: () => null,
      update(value, tr) {
        for (const one of tr.effects) if (one.is(show)) return one.value;
        if (value === null) return null;
        const pos = tr.changes.mapPos(value.pos);
        return pos === value.pos ? value : { ...value, pos };
      },
    });
  }

  extension(): Extension {
    const shown = this.shown;
    return [
      shown,
      showTooltip.compute([shown], (state) => {
        const where = state.field(shown);
        return where === null ? null : this.tooltip(where.pos);
      }),
      EditorView.contentAttributes.compute([shown], (state): Record<string, string> =>
        state.field(shown)?.keys ? { 'data-keys': 'completion editor' } : {},
      ),
      ViewPlugin.define((view) => {
        this.attach(view);
        return {
          update: (update: ViewUpdate) => this.update(update),
          destroy: () => this.detach(view),
        };
      }),
    ];
  }

  /** Called by key: the list appears here even mid-word and inside a comment. */
  showHere(): void {
    const view = this.view;
    if (!view) return;
    const state = view.state;
    let from = state.selection.main.head;
    while (from > 0 && WORD_CHAR.test(state.doc.sliceString(from - 1, from))) from -= 1;
    this.open(state, from, state.doc.sliceString(from - 1, from) === '.' ? '.' : null, true);
  }

  /**
   * Insert what is selected. `replace` (Tab, as in IDEA) also eats the tail of the word
   * after the caret: `get|Value` plus `getName` gives `getName` rather than
   * `getNameValue`.
   *
   * An import, if it has already been read in, lands as THE SAME edit — one undo
   * removes both the name and the import line. Not read in yet: we insert the name at
   * once and the import catches up when it arrives; waiting for the network on Enter is
   * not on.
   */
  accept(mode: 'insert' | 'replace'): void {
    const view = this.view;
    const chosen = this.session.current();
    const asked = this.session.ask;
    if (!view || !chosen || !asked) return;
    const state = view.state;
    const item = chosen.item;
    const from = item.from ?? asked.from;
    let to = state.selection.main.head;
    if (mode === 'replace') {
      while (to < state.doc.length && WORD_CHAR.test(state.doc.sliceString(to, to + 1))) to += 1;
    }
    const insert = item.insert ?? item.label;
    const settled = this.session.settled(chosen.key);
    const changes = state.changes([{ from, to, insert }, ...this.edits(state, settled, from, to)]);
    view.dispatch({
      changes,
      selection: { anchor: changes.mapPos(from, -1) + (item.caret ?? insert.length) },
      userEvent: 'input.complete',
      scrollIntoView: true,
    });
    this.history.chose(item.label);
    const later = settled || !item.resolve ? null : this.session.detailsOf(chosen);
    this.session.close();
    if (later) void later.then((details) => this.lateImport(details, from));
  }

  private tooltip(pos: number): Tooltip {
    if (this.placed?.pos === pos) return this.placed;
    this.placed = {
      pos,
      above: false,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'cmp-host';
        return { dom, destroy: this.mount(dom) };
      },
    };
    return this.placed;
  }

  private attach(view: EditorView): void {
    this.view = view;
    this.unwatch?.();
    this.unwatch = effect(() => {
      void this.session.visible.value;
      void this.session.listed.value;
      void this.session.started.value;
      queueMicrotask(() => this.sync());
    });
  }

  private detach(view: EditorView): void {
    if (this.view !== view) return;
    this.unwatch?.();
    this.unwatch = null;
    this.view = null;
    this.session.close();
  }

  private sync(): void {
    const view = this.view;
    if (!view) return;
    const want = this.session.visible.value ? { pos: this.session.from, keys: this.session.listed.value } : null;
    const have = view.state.field(this.shown, false) ?? null;
    if (want?.pos !== have?.pos || want?.keys !== have?.keys) view.dispatch({ effects: this.show.of(want) });
  }

  private update(update: ViewUpdate): void {
    const session = this.session;
    if (update.focusChanged && !update.view.hasFocus) {
      session.close();
      return;
    }
    if (!update.docChanged && !update.selectionSet) return;
    if (update.transactions.some((tr) => tr.isUserEvent('input.complete'))) return;
    const state = update.state;
    const range = state.selection.main;
    if (state.selection.ranges.length > 1 || !range.empty) {
      session.close();
      return;
    }
    const head = range.head;
    const typed = update.transactions.some((tr) => tr.isUserEvent('input.type'));
    const erased = update.transactions.some((tr) => tr.isUserEvent('delete'));

    const asked = session.ask;
    if (session.active.value && asked) {
      const typing = head >= asked.from ? state.doc.sliceString(asked.from, head) : null;
      const emptied = typing === '' && asked.trigger === null && !asked.explicit;
      if (typing !== null && WORD.test(typing) && (typed || erased) && !emptied) {
        const path = this.pathOf();
        if (path) session.refine(this.askAt(state, path, asked.from, asked.trigger, asked.explicit));
        return;
      }
      session.close();
    }
    if (typed && this.auto() && !this.quiet(state, head)) this.maybeOpen(state, head, this.insertedFrom(update));
  }

  /**
   * Whether to open by ourselves. A word has to BEGIN in what was just typed: one
   * letter is a word's first letter; several at once (IME, a paste by automation) count
   * too, if the whole word is inside what was typed. A list closed by Escape does not
   * pop up again on the next letter of the same word: the word's beginning is already
   * in the previous edit. A word right after a dot, like a bare dot, is a question
   * about members.
   */
  private maybeOpen(state: EditorState, head: number, inserted: number): void {
    let start = head;
    while (start > 0 && WORD_CHAR.test(state.doc.sliceString(start - 1, start))) start -= 1;
    if (start !== head && (!WORD_START.test(state.doc.sliceString(start, start + 1)) || start < inserted)) return;
    if (state.doc.sliceString(start - 1, start) === '.') {
      const line = state.doc.lineAt(start);
      if (/(^|[^\w$])\d+$/.test(line.text.slice(0, start - 1 - line.from))) return;
      this.open(state, start, '.', false);
      return;
    }
    if (start !== head) this.open(state, start, null, false);
  }

  /** Where in the new text what this edit brought begins. */
  private insertedFrom(update: ViewUpdate): number {
    let from = update.state.doc.length;
    update.changes.iterChangedRanges((_fromA, _toA, fromB) => {
      from = Math.min(from, fromB);
    });
    return from;
  }

  private open(state: EditorState, from: number, trigger: string | null, explicit: boolean): void {
    const path = this.pathOf();
    if (!path) return;
    this.session.start(this.askAt(state, path, from, trigger, explicit));
  }

  private askAt(state: EditorState, path: string, from: number, trigger: string | null, explicit: boolean): Ask {
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    return {
      path,
      text: state.doc.toString(),
      pos,
      from,
      line: line.number - 1,
      character: pos - line.from,
      trigger,
      explicit,
    };
  }

  private quiet(state: EditorState, pos: number): boolean {
    for (let node: { name: string; parent: unknown } | null = syntaxTree(state).resolveInner(pos, -1); node; ) {
      if (node.name === 'Interpolation') return false;
      if (QUIET.test(node.name)) return true;
      node = node.parent as typeof node;
    }
    return false;
  }

  /**
   * Edits beyond the insertion (an import), except those that would touch the insertion
   * itself.
   */
  private edits(state: EditorState, details: Details | null, from: number, to: number): ChangeSpec[] {
    const out: ChangeSpec[] = [];
    for (const edit of details?.edits ?? []) {
      const start = this.offset(state, edit.range.start);
      const end = this.offset(state, edit.range.end);
      if (start === null || end === null || (end > from && start < to)) continue;
      out.push({ from: start, to: end, insert: edit.text });
    }
    return out;
  }

  /**
   * The import caught the insertion up. We only apply what is ABOVE the insertion's
   * line: during those milliseconds the user was typing at the caret, and the lines
   * above it are the ones the server saw; everything below may have shifted.
   */
  private lateImport(details: Details | null, from: number): void {
    const view = this.view;
    if (!view || !details || details.edits.length === 0) return;
    const state = view.state;
    const line = state.doc.lineAt(Math.min(from, state.doc.length)).number - 1;
    const above = { ...details, edits: details.edits.filter((edit) => edit.range.end.line < line) };
    const changes = this.edits(state, above, from, from);
    if (changes.length > 0) view.dispatch({ changes, userEvent: 'input.complete' });
  }

  private offset(state: EditorState, at: Position): number | null {
    if (at.line + 1 > state.doc.lines) return null;
    const line = state.doc.line(at.line + 1);
    return Math.min(line.from + at.character, line.to);
  }
}
