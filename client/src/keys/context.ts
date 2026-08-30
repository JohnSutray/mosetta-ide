import type { KeyContext } from '@ide/protocol';

export class KeyContexts {
  readonly attr = 'data-keys';

  of(target: Element | null): KeyContext {
    const owner = target?.closest(`[${this.attr}]`);
    const named = owner?.getAttribute(this.attr);
    return (named ?? 'global') as KeyContext;
  }

  here(): KeyContext {
    return this.of(typeof document === 'undefined' ? null : document.activeElement);
  }
}

export const keyContexts = new KeyContexts();
