import { describe, expect, it, vi } from 'vitest';
import { Startup } from '../src/state/startup.js';

/**
 * The tab's first half-second. The arithmetic is small, but easy to get wrong and hard
 * to see wrong: it lives for a quarter of a second, once per reload.
 */
describe('the startup splash', () => {
  it('on a fast machine it holds for the minimum rather than flickering', () => {
    const startup = new Startup();
    startup.begin(1000);
    expect(startup.holdFor(1050)).toBe(startup.minimum - 50);
    startup.stop();
  });

  it('on a slow one it goes out at once: it has hung around long enough already', () => {
    const startup = new Startup();
    startup.begin(1000);
    expect(startup.holdFor(1000 + startup.minimum)).toBe(0);
    expect(startup.holdFor(9999)).toBe(0);
    startup.stop();
  });

  it('the layout appeared — the splash leaves, and there will be no explanation', () => {
    vi.useFakeTimers();
    const startup = new Startup();
    startup.begin(0);
    startup.shellAppeared(0);
    vi.advanceTimersByTime(startup.minimum);
    expect(startup.covering.value).toBe(false);
    vi.advanceTimersByTime(startup.patience);
    expect(startup.explain.value).toBe(false);
    startup.stop();
    vi.useRealTimers();
  });

  it('the layout still is not there — we explain rather than hold the splash forever', () => {
    vi.useFakeTimers();
    const startup = new Startup();
    startup.begin(0);
    vi.advanceTimersByTime(startup.patience - 1);
    expect(startup.explain.value).toBe(false);
    expect(startup.covering.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(startup.explain.value).toBe(true);
    expect(startup.covering.value).toBe(false);
    startup.stop();
    vi.useRealTimers();
  });

  it('the tab left — the timers with it: somebody else\'s state will not travel', () => {
    vi.useFakeTimers();
    const startup = new Startup();
    startup.begin(0);
    startup.stop();
    vi.advanceTimersByTime(startup.patience * 2);
    expect(startup.explain.value).toBe(false);
    vi.useRealTimers();
  });
});
