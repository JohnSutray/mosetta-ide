
const globals = globalThis as Record<string, unknown>;

globals['self'] ??= globalThis;

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
