import { signal } from '@preact/signals';
import type { TreeSelection } from './state.js';

export class TreeTypeahead {
  readonly term = signal('');

  constructor(private readonly selection: TreeSelection) {}

  match(name: string): [number, number] | null {
    const term = this.term.value.toLowerCase();
    if (term === '') return null;
    const at = name.toLowerCase().indexOf(term);
    return at === -1 ? null : [at, at + term.length];
  }

  type(text: string): void {
    this.term.value = text;
    if (text === '') return;
    const term = text.toLowerCase();
    const order = this.selection.visibleOrder();
    if (order.length === 0) return;
    const current = order.indexOf(this.selection.focus.value ?? '');
    if (current !== -1 && nameOf(order[current]!).includes(term)) return;
    const found =
      this.seek(order, current + 1, 1, (name) => name.startsWith(term)) ??
      this.seek(order, current + 1, 1, (name) => name.includes(term));
    if (found !== null) this.selection.only(found);
  }

  move(delta: 1 | -1): void {
    const term = this.term.value.toLowerCase();
    if (term === '') return;
    const order = this.selection.visibleOrder();
    const current = order.indexOf(this.selection.focus.value ?? '');
    const found = this.seek(order, current + delta, delta, (name) => name.includes(term));
    if (found !== null) this.selection.only(found);
  }

  clear(): void {
    this.term.value = '';
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
