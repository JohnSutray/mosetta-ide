import { signal, type Signal } from '@preact/signals';

export type Scope = 'tab' | 'both';

export class Memory {
  private readonly prefix = 'web-ide.';

  recall<T>(key: string, fallback: T): T {
    const full = this.prefix + key;
    for (const store of [this.tab(), this.machine()]) {
      if (!store) continue;
      try {
        const raw = store.getItem(full);
        if (raw === null) continue;
        return JSON.parse(raw) as T;
      } catch {}
    }
    return fallback;
  }

  keep(key: string, value: unknown, scope: Scope = 'both'): void {
    const full = this.prefix + key;
    const raw = JSON.stringify(value);
    const stores = scope === 'tab' ? [this.tab()] : [this.tab(), this.machine()];
    for (const store of stores) {
      try {
        store?.setItem(full, raw);
      } catch {}
    }
  }

  forget(key: string, scope: Scope = 'both'): void {
    const full = this.prefix + key;
    const stores = scope === 'tab' ? [this.tab()] : [this.tab(), this.machine()];
    for (const store of stores) {
      try {
        store?.removeItem(full);
      } catch {}
    }
  }

  signal<T>(key: string, initial: T, scope: Scope = 'both'): Signal<T> {
    const sig = signal<T>(this.recall(key, initial));
    sig.subscribe((value) => this.keep(key, value, scope));
    return sig;
  }

  private tab(): Storage | null {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
      return null;
    }
  }

  private machine(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }
}
