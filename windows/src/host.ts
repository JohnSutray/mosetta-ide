import type { KeyContext } from '@ide/protocol';

export interface UiHost {
  t(key: string, params?: Record<string, string | number>): string;
  catchesKeys(context: KeyContext | undefined): boolean;
  keep(key: string, value: unknown): void;
  recall<T>(key: string, fallback: T): T;
}

export const NOBODY: UiHost = {
  t: (key) => key,
  catchesKeys: () => false,
  keep: () => {},
  recall: (_key, fallback) => fallback,
};
