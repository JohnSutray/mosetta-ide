import type { Layout } from '@mosetta/ide-plugin-search';
import { signal } from '@preact/signals';
import type { TreeSelection } from './state.js';

export class TreeTypeahead {
  readonly term = signal('');
  readonly found = signal(true);

  constructor(
    private readonly selection: TreeSelection,
    private readonly layout: () => Pick<Layout, 'retype'>,
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
    const order = this.selection.visibleOrder();
    if (order.length === 0) {
      this.found.value = false;
      return;
    }
    const current = order.indexOf(this.selection.focus.value ?? '');
    const here = current === -1 ? null : nameOf(order[current]!);
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
    if (found !== null) this.selection.only(found);
  }

  move(delta: 1 | -1): void {
    const variants = this.variants();
    if (variants.length === 0) return;
    const order = this.selection.visibleOrder();
    const current = order.indexOf(this.selection.focus.value ?? '');
    for (const variant of variants) {
      const found = this.seek(order, current + delta, delta, (name) => name.includes(variant));
      if (found !== null) {
        this.selection.only(found);
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
      if (test(nameOf(path))) return path;
    }
    return null;
  }
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).toLowerCase();
}
