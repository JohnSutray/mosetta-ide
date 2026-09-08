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
import { signal } from '@preact/signals';

export type FindMode = 'off' | 'find' | 'replace';

export interface FindCount {
  current: number;
  total: number;
}

export class FindState {
  readonly mode = signal<FindMode>('off');
  readonly term = signal('');
  readonly replacement = signal('');
  readonly caseSensitive = signal(false);
  readonly words = signal(false);
  readonly regex = signal(false);
  readonly multiline = signal(false);
  readonly count = signal<FindCount | null>(null);
  readonly valid = signal(true);
  readonly focusEpoch = signal(0);

  private view: EditorView | null = null;

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

  newline(): void {
    this.multiline.value = true;
    this.term.value = `${this.term.value}\n`;
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

  recount(): void {
    const view = this.view;
    this.count.value = view ? this.countIn(view.state) : null;
  }

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

  private ensureOpen(): boolean {
    if (!this.view) return false;
    if (this.mode.value === 'off') this.open('find');
    return true;
  }
}
