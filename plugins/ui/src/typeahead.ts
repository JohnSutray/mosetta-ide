import { signal } from '@preact/signals';

/**
 * A list searched by letters: what is shown, where the caret is, and where to move it.
 * For the tree those are its rows, for the changes panel its own.
 */
export interface TypeaheadList {
  /** The keys of the SHOWN rows, top to bottom. What is collapsed is not included. */
  order(): string[];
  /** Where the caret is now. */
  current(): string | null;
  /** Move the caret to a row. */
  go(key: string): void;
  /** What to compare with what was typed: the file's name rather than the whole path. */
  nameOf(key: string): string;
}

/**
 * Type-ahead search in a list: while the keyboard belongs to the list, what is typed is
 * searched among the SHOWN rows, and on every letter the selection jumps to the nearest
 * match.
 *
 * The letters are taken by a real input field inside the tree (a printable character
 * belongs to the field), while the arrows, Enter and Backspace on an empty field still
 * belong to the keymap. The jump has three rules and all of them come from IDEA: the
 * current row stays if it still fits; otherwise we first look for a name that BEGINS
 * with what was typed, then for one where it occurs; we search forwards, in a circle.
 */
export class Typeahead {
  readonly term = signal('');
  /**
   * Whether what was typed was found among the shown rows. Not found means the search
   * frame turns red, as in IDEA: a silent search is indistinguishable from a broken
   * one.
   */
  readonly found = signal(true);

  constructor(
    private readonly list: TypeaheadList,
    /**
     * The keyboard layout table is a field of the search plugin. It arrives as a
     * STRUCTURE rather than by import: the widgets have no business knowing about the
     * search plugin, and the search plugin no business depending on the widgets the
     * other way round.
     */
    private readonly layout: () => { retype(text: string): string | null },
  ) {}

  /**
   * What to search for: what was typed, and the same in the other keyboard layout. A
   * human searches for `style` without looking at the keyboard and gets `ыершд` — that
   * is neither a typo nor another language but the same keys. "Search everywhere" reads
   * both layouts; here is the same table rather than a second one.
   */
  private variants(): string[] {
    const term = this.term.value.toLowerCase();
    if (term === '') return [];
    const other = this.layout().retype(term);
    return other ? [term, other.toLowerCase()] : [term];
  }

  /**
   * Where the match is in the name — for highlighting; `null` means no match, or
   * nothing to search for.
   */
  match(name: string): [number, number] | null {
    const lower = name.toLowerCase();
    for (const variant of this.variants()) {
      const at = lower.indexOf(variant);
      if (at !== -1) return [at, at + variant.length];
    }
    return null;
  }

  /** Typed (or deleted) — search from the current row without abandoning it. */
  type(text: string): void {
    this.term.value = text;
    if (text === '') {
      this.found.value = true;
      return;
    }
    const variants = this.variants();
    const order = this.list.order();
    if (order.length === 0) {
      this.found.value = false;
      return;
    }
    const current = order.indexOf(this.list.current() ?? '');
    const here = current === -1 ? null : this.list.nameOf(order[current]!).toLowerCase();
    if (here !== null && variants.some((variant) => here.includes(variant))) {
      this.found.value = true;
      return;
    }
    let found: string | null = null;
    for (const variant of variants) {
      found =
        this.seek(order, current + 1, 1, (name) => name.startsWith(variant)) ??
        this.seek(order, current + 1, 1, (name) => name.includes(variant));
      if (found !== null) break;
    }
    this.found.value = found !== null;
    if (found !== null) this.list.go(found);
  }

  /** An arrow with something typed: the next or previous match, in a circle. */
  move(delta: 1 | -1): void {
    const variants = this.variants();
    if (variants.length === 0) return;
    const order = this.list.order();
    const current = order.indexOf(this.list.current() ?? '');
    for (const variant of variants) {
      const found = this.seek(order, current + delta, delta, (name) => name.includes(variant));
      if (found !== null) {
        this.list.go(found);
        return;
      }
    }
  }

  clear(): void {
    this.term.value = '';
    this.found.value = true;
  }

  private seek(order: string[], from: number, delta: 1 | -1, test: (name: string) => boolean): string | null {
    const n = order.length;
    for (let i = 0; i < n; i += 1) {
      const at = (((from + i * delta) % n) + n) % n;
      const path = order[at]!;
      if (test(this.list.nameOf(path).toLowerCase())) return path;
    }
    return null;
  }
}
