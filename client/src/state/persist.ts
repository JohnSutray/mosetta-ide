import { signal, type Signal } from '@preact/signals';

const PREFIX = 'web-ide.';

export type Scope = 'tab' | 'both';

function tabStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function machineStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function recall<T>(key: string, fallback: T): T {
  const full = PREFIX + key;
  for (const store of [tabStore(), machineStore()]) {
    if (!store) continue;
    try {
      const raw = store.getItem(full);
      if (raw === null) continue;
      return JSON.parse(raw) as T;
    } catch {}
  }
  return fallback;
}

export function keep(key: string, value: unknown, scope: Scope = 'both'): void {
  const full = PREFIX + key;
  const raw = JSON.stringify(value);
  const stores = scope === 'tab' ? [tabStore()] : [tabStore(), machineStore()];
  for (const store of stores) {
    try {
      store?.setItem(full, raw);
    } catch {}
  }
}

export function forget(key: string, scope: Scope = 'both'): void {
  const full = PREFIX + key;
  const stores = scope === 'tab' ? [tabStore()] : [tabStore(), machineStore()];
  for (const store of stores) {
    try {
      store?.removeItem(full);
    } catch {}
  }
}

export function persisted<T>(key: string, initial: T, scope: Scope = 'both'): Signal<T> {
  const sig = signal<T>(recall(key, initial));
  sig.subscribe((value) => keep(key, value, scope));
  return sig;
}
