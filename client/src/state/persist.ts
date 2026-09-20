import { signal, type Signal } from '@preact/signals';

/**
 * The tab's memory and the machine's memory.
 *
 * This continues the rule by which the project moved into the tab's ADDRESS: two tabs
 * holding different projects must not fight over one cell. The same is true of
 * everything else a person arranged by hand — panel widths, popup sizes, which panels
 * are open, which file is on screen.
 *
 * Hence two stores and one reading rule:
 *
 * * `sessionStorage` is this tab. It survives a reload and the browser restoring the session, but every tab has its own; drag the panels about in one and the other stays as it was.
 * * `localStorage` is the last layout on this machine. A new tab GROWS OUT of it: opening one with factory widths while a familiar layout lies right there would be silly.
 *
 * We read the tab, then the machine. We write to both, except for what only makes sense
 * here and now (the open file).
 */

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

  /**
   * Rename keys wholesale: `rename` receives a key without its prefix and returns a new
   * one, or `null`. If the new one already exists, the old one simply goes: we never
   * overwrite the fresher of the two.
   */
  migrate(rename: (key: string) => string | null): void {
    for (const store of [this.tab(), this.machine()]) {
      if (!store) continue;
      try {
        const keys: string[] = [];
        for (let i = 0; i < store.length; i += 1) {
          const full = store.key(i);
          if (full?.startsWith(this.prefix)) keys.push(full);
        }
        for (const full of keys) {
          const next = rename(full.slice(this.prefix.length));
          if (next === null) continue;
          const value = store.getItem(full);
          if (value !== null && store.getItem(this.prefix + next) === null) store.setItem(this.prefix + next, value);
          store.removeItem(full);
        }
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
