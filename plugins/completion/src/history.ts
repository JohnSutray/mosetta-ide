import type { Signal } from '@preact/signals';

const STEP = 12;
const MOST = 40;

export class ChoiceHistory {
  constructor(
    private readonly store: Signal<Record<string, number>>,
    private readonly send: (label: string) => void = () => undefined,
  ) {}

  bonus(label: string): number {
    const times = this.store.value[label] ?? 0;
    return times === 0 ? 0 : Math.min(MOST, STEP * Math.log2(1 + times));
  }

  chose(label: string): void {
    this.store.value = { ...this.store.value, [label]: (this.store.value[label] ?? 0) + 1 };
    this.send(label);
  }

  heard(label: string, times: number): void {
    if (this.store.value[label] === times) return;
    this.store.value = { ...this.store.value, [label]: times };
  }

  replace(all: Record<string, number>): void {
    this.store.value = all;
  }
}
