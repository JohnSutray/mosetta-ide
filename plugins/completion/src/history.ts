import type { Signal } from '@preact/signals';

/**
 * The price of one choice and the ceiling: history hints rather than shouting the match
 * down.
 */
const STEP = 12;
const MOST = 40;

/**
 * What the user chose before. This is what WebStorm is loved for without being
 * noticed: over months the list adapts to your hand. We count by name rather than by
 * place: cruder than IDEA's, but it works from the first day.
 *
 * The truth belongs to the server half: here is a copy the ranker reads. A choice is
 * added at once — the list does not wait for the network — and travels to the server;
 * the server's answer sets the exact number, so nothing is counted twice, and a choice
 * in a neighbouring tab arrives as an event.
 */
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

  /** The server said how many there really are: its count is shared by every tab. */
  heard(label: string, times: number): void {
    if (this.store.value[label] === times) return;
    this.store.value = { ...this.store.value, [label]: times };
  }

  /** The whole count from the server — on attaching to a project. */
  replace(all: Record<string, number>): void {
    this.store.value = all;
  }
}
