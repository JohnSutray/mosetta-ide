import type { KeyContext } from '@ide/protocol';

export interface UiHost {
  t(key: string, params?: Record<string, string | number>): string;
  catchesKeys(context: KeyContext | undefined): boolean;
  keep(key: string, value: unknown): void;
  recall<T>(key: string, fallback: T): T;
}

const NOBODY: UiHost = {
  t: (key) => key,
  catchesKeys: () => false,
  keep: () => {},
  recall: (_key, fallback) => fallback,
};

let installed: UiHost = NOBODY;

export const host: UiHost = {
  t: (key, params) => installed.t(key, params),
  catchesKeys: (context) => installed.catchesKeys(context),
  keep: (key, value) => installed.keep(key, value),
  recall: (key, fallback) => installed.recall(key, fallback),
};

export function installHost(next: UiHost): void {
  installed = next;
}

export function updateHost(part: Partial<UiHost>): void {
  installed = { ...installed, ...part };
}
