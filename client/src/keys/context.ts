import type { KeyContext } from '@ide/protocol';

export const KEYS_ATTR = 'data-keys';

export function contextOf(target: Element | null): KeyContext {
  const owner = target?.closest(`[${KEYS_ATTR}]`);
  const named = owner?.getAttribute(KEYS_ATTR);
  return (named ?? 'global') as KeyContext;
}

export function resolveContext(): KeyContext {
  return contextOf(typeof document === 'undefined' ? null : document.activeElement);
}
