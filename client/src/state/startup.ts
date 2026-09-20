import { signal } from '@preact/signals';

/**
 * The first half-second of a tab's life.
 *
 * While the plugins travel over the socket, get built and come up, nobody occupies the
 * `chrome.main` slot — and the core honestly shows "there is nobody to draw the
 * panels". The explanation is correct, but showing it on EVERY reload for a quarter of
 * a second is a lie: the layout is there, it simply has not arrived yet.
 *
 * So the core grew a third state between "empty" and "drawn": WAITING. It is visible as
 * the splash screen, and this class decides about it:
 *
 * * the splash holds for AT LEAST `minimum` ms. Otherwise it would flash by on a fast machine, and we would have traded one flicker for another;
 * * no layout for longer than `patience` means there really is none, and it is time to explain.
 *
 * A class with pure arithmetic: "how much longer to hold" is a decision with a right
 * answer, and a test checks it. The timers are outside and the time arrives as an
 * argument.
 */
export class Startup {
  /** The splash is on screen. */
  readonly covering = signal(true);
  /** Time to say that nobody drew the layout. */
  readonly explain = signal(false);

  /** How long the splash lives at minimum: any shorter and it is a flicker. */
  readonly minimum = 420;
  /** How long we wait for the layout before explaining its absence. */
  readonly patience = 2500;

  private born = 0;
  private readonly timers: Array<ReturnType<typeof setTimeout>> = [];

  /** The tab was born. Both the minimum and the patience count from here. */
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

  /** The layout took its place: put the splash out, but not with a jerk. */
  shellAppeared(now = Date.now()): void {
    if (!this.covering.peek()) return;
    this.timers.push(setTimeout(() => (this.covering.value = false), this.holdFor(now)));
  }

  /**
   * How much longer to hold the splash, having seen the layout at `now`.
   *
   * Zero if it has hung around long enough anyway. This is the whole of the class's
   * arithmetic, and precisely what the test checks: on a fast machine the answer has to
   * be positive, on a slow one zero rather than a negative number.
   */
  holdFor(now: number): number {
    return Math.max(0, this.minimum - (now - this.born));
  }

  /** The tab is leaving: the timers must not outlive it. */
  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.length = 0;
  }
}
