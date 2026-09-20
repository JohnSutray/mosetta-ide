import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from '@codemirror/search';
import { computed, signal, type ReadonlySignal } from '@preact/signals';

export type FindMode = 'off' | 'find' | 'replace';

export interface FindCount {
  /**
   * The number of the match under the selection, one-based; zero means the selection is
   * not on a match.
   */
  current: number;
  total: number;
}

/**
 * Find and replace in a file.
 *
 * The state is here, the mechanics are in `@codemirror/search`: the query, the cursor
 * over the matches, the highlighting and the replacement itself are its. The CodeMirror
 * panel is opened only for the highlighting's sake: we draw into it, and it merely
 * holds the place at the top. The live editor arrives as an extension (`attach`) rather
 * than being handed over by a neighbour: the editor does not hand it outwards, whereas
 * an extension is entitled to it.
 *
 * Find and replace are one state with two modes: moving from one to the other does not
 * lose what was typed, and that is the main reason they are not two windows.
 */
export class FindState {
  readonly mode = signal<FindMode>('off');
  readonly term = signal('');
  readonly replacement = signal('');
  readonly caseSensitive = signal(false);
  readonly words = signal(false);
  readonly regex = signal(false);
  /**
   * A field of several lines is a PROPERTY OF THE TERM rather than a toggle of its own.
   * This used to be a signal that could only be switched on: the button looked pressed
   * and would not unpress. Now the state is derived from the text, and there is nowhere
   * for them to drift.
   */
  readonly multiline: ReadonlySignal<boolean> = computed(() => this.term.value.includes('\n'));
  /** How many were found and where we are; `null` means there is nothing to search for. */
  readonly count = signal<FindCount | null>(null);
  /** The regular expression parsed. */
  readonly valid = signal(true);
  /** Rises when it is time for the search field to take the keyboard. */
  readonly focusEpoch = signal(0);

  private view: EditorView | null = null;

  /** An editor was born with our extension. An open search moves into it. */
  attach(view: EditorView): void {
    this.view = view;
    if (this.mode.value === 'off') return;
    queueMicrotask(() => {
      if (this.view !== view) return;
      openSearchPanel(view);
      this.apply();
    });
  }

  detach(view: EditorView): void {
    if (this.view === view) this.view = null;
  }

  query(): SearchQuery {
    return new SearchQuery({
      search: this.term.value,
      replace: this.replacement.value,
      caseSensitive: this.caseSensitive.value,
      regexp: this.regex.value,
      wholeWord: this.words.value,
    });
  }

  /**
   * Open in the required mode. What is selected in the editor becomes the term — that
   * is what IDEA does, and the hand is used to it; we do not take a multi-line
   * selection, it is almost always accidental. We take it only when opening FROM
   * SCRATCH: moving from find to replace has to keep what was typed, and by that moment
   * the selection stands on the match and would overwrite its case.
   */
  open(mode: 'find' | 'replace'): void {
    const view = this.view;
    if (view) {
      const { main } = view.state.selection;
      if (this.mode.value === 'off' && !main.empty) {
        const picked = view.state.sliceDoc(main.from, main.to);
        if (!picked.includes('\n')) this.term.value = picked;
      }
      openSearchPanel(view);
    }
    this.mode.value = mode;
    this.apply();
    this.focusEpoch.value += 1;
  }

  close(): void {
    this.mode.value = 'off';
    const view = this.view;
    if (!view) return;
    closeSearchPanel(view);
    view.focus();
  }

  setTerm(text: string): void {
    this.term.value = text;
    this.apply();
  }

  setReplacement(text: string): void {
    this.replacement.value = text;
    this.apply();
  }

  toggleCase(): void {
    this.caseSensitive.value = !this.caseSensitive.value;
    this.apply();
  }

  toggleWords(): void {
    this.words.value = !this.words.value;
    this.apply();
  }

  toggleRegex(): void {
    this.regex.value = !this.regex.value;
    this.apply();
  }

  /**
   * The multi-line toggle. Off: we append a newline at the end and the field unfolds.
   * On: we remove the newlines and the field folds back — which is exactly the reverse
   * action rather than a loss of text, and it is visible in the field at once.
   */
  newline(): void {
    const term = this.term.value;
    this.term.value = term.includes('\n') ? term.replace(/\n/g, '') : `${term}\n`;
    this.apply();
    this.focusEpoch.value += 1;
  }

  next(): void {
    if (!this.ensureOpen()) return;
    findNext(this.view!);
    this.recount();
  }

  prev(): void {
    if (!this.ensureOpen()) return;
    findPrevious(this.view!);
    this.recount();
  }

  /**
   * Replace the CURRENT one and move to the next. CodeMirror's "replace" with the
   * selection off a match merely selects it — a second press replaces; IDEA replaces on
   * the first, and the hand expects that.
   */
  replaceOne(): void {
    const view = this.view;
    if (!view || this.mode.value !== 'replace') return;
    const found = this.countIn(view.state);
    if (!found || found.total === 0) return;
    if (found.current === 0) findNext(view);
    replaceNext(view);
    this.recount();
  }

  replaceEverything(): void {
    const view = this.view;
    if (!view || this.mode.value !== 'replace') return;
    replaceAll(view);
    this.recount();
  }

  /** The text changed under us — recount. */
  recount(): void {
    const view = this.view;
    this.count.value = view ? this.countIn(view.state) : null;
  }

  /**
   * How many matches there are and which of them is under the selection. Counted over
   * the whole document rather than the visible part: the number "2/16" promises the
   * whole file.
   */
  countIn(state: EditorState): FindCount | null {
    const query = this.query();
    if (this.term.value === '' || !query.valid) return null;
    const { main } = state.selection;
    let total = 0;
    let current = 0;
    const cursor = query.getCursor(state);
    for (let step = cursor.next(); !step.done; step = cursor.next()) {
      total += 1;
      if (step.value.from === main.from && step.value.to === main.to) current = total;
      if (total >= 100_000) break;
    }
    return { current, total };
  }

  private apply(): void {
    const query = this.query();
    this.valid.value = query.valid || this.term.value === '';
    const view = this.view;
    if (!view) return;
    view.dispatch({ effects: setSearchQuery.of(query) });
    this.recount();
  }

  /** "Next" with no search open opens it: otherwise the key stays silent. */
  private ensureOpen(): boolean {
    if (!this.view) return false;
    if (this.mode.value === 'off') this.open('find');
    return true;
  }
}
