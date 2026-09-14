import { describe, expect, it, vi } from 'vitest';
import { Startup } from '../src/state/startup.js';

describe('заставка запуска', () => {
  it('на быстрой машине держится минимум, а не мигает', () => {
    const startup = new Startup();
    startup.begin(1000);
    expect(startup.holdFor(1050)).toBe(startup.minimum - 50);
    startup.stop();
  });

  it('на медленной гасится сразу: своё она уже провисела', () => {
    const startup = new Startup();
    startup.begin(1000);
    expect(startup.holdFor(1000 + startup.minimum)).toBe(0);
    expect(startup.holdFor(9999)).toBe(0);
    startup.stop();
  });

  it('раскладка появилась — заставка уходит, объяснения не будет', () => {
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

  it('раскладки так и нет — объясняем, а не держим заставку вечно', () => {
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

  it('вкладка ушла — таймеры с ней: чужое состояние не поедет', () => {
    vi.useFakeTimers();
    const startup = new Startup();
    startup.begin(0);
    startup.stop();
    vi.advanceTimersByTime(startup.patience * 2);
    expect(startup.explain.value).toBe(false);
    vi.useRealTimers();
  });
});
