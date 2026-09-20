import { signal } from '@preact/signals';

export interface TypeaheadList {
  order(): string[];
  current(): string | null;
  go(key: string): void;
  nameOf(key: string): string;
}

export class Typeahead {
  readonly term = signal('');
  readonly found = signal(true);

  constructor(
    private readonly list: TypeaheadList,
    private readonly layout: () => { retype(text: string): string | null },
  ) {}

  private variants(): string[] {
    const term = this.term.value.toLowerCase();
    if (term === '') return [];
    const other = this.layout().retype(term);
    return other ? [term, other.toLowerCase()] : [term];
  }

  match(name: string): [number, number] | null {
    const lower = name.toLowerCase();
    for (const variant of this.variants()) {
      const at = lower.indexOf(variant);
      if (at !== -1) return [at, at + variant.length];
    }
    return null;
  }

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
