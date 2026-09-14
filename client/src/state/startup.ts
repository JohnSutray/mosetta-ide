import { signal } from '@preact/signals';

export class Startup {
  readonly covering = signal(true);
  readonly explain = signal(false);

  readonly minimum = 420;
  readonly patience = 2500;

  private born = 0;
  private readonly timers: Array<ReturnType<typeof setTimeout>> = [];

  begin(now = Date.now()): void {
    this.born = now;
    this.timers.push(
      setTimeout(() => {
        if (!this.covering.peek()) return;
        this.covering.value = false;
        this.explain.value = true;
      }, this.patience),
    );
  }

  shellAppeared(now = Date.now()): void {
    if (!this.covering.peek()) return;
    this.timers.push(setTimeout(() => (this.covering.value = false), this.holdFor(now)));
  }

  holdFor(now: number): number {
    return Math.max(0, this.minimum - (now - this.born));
  }

  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.length = 0;
  }
}
