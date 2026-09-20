/**
 * Browser globals for the client's tests.
 *
 * The client is browser code, yet it runs under Node. That got away with it for a year
 * and a half because the tests touched pure functions; the first test to import a WHOLE
 * branch of the interface dragged xterm along with it — and xterm looks for `self` as
 * it loads — and fell over on the import, before reaching the first `it`.
 *
 * A full jsdom is both unnecessary and harmful here: it pretends we have a DOM, and the
 * test starts checking the DOM rather than us. What is here is exactly what foreign
 * libraries need in order to load, and not one line more.
 */

const globals = globalThis as Record<string, unknown>;

globals['self'] ??= globalThis;

/** An in-memory store: like the real one, but it lives for one run. */
class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }
  key(at: number): string | null {
    return [...this.items.keys()][at] ?? null;
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  clear(): void {
    this.items.clear();
  }
}

globals['localStorage'] ??= new MemoryStorage();
globals['sessionStorage'] ??= new MemoryStorage();
