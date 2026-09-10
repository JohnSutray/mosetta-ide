import type { Signal } from '@preact/signals';

const LIMIT = 500;
const STEP = 12;
const MOST = 40;

export class ChoiceHistory {
  constructor(private readonly store: Signal<Record<string, number>>) {}

  bonus(label: string): number {
    const times = this.store.value[label] ?? 0;
    return times === 0 ? 0 : Math.min(MOST, STEP * Math.log2(1 + times));
  }

  chose(label: string): void {
    const next = { ...this.store.value, [label]: (this.store.value[label] ?? 0) + 1 };
    const names = Object.keys(next).filter((name) => name !== label);
    if (names.length >= LIMIT) {
      names.sort((a, b) => next[a]! - next[b]!);
      for (const name of names.slice(0, names.length - LIMIT + 1)) delete next[name];
    }
    this.store.value = next;
  }
}
