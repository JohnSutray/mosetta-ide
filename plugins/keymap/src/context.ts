import type { KeyContext } from '@ide/protocol';

export class KeyContexts {
  readonly attr = 'data-keys';

  of(target: Element | null): KeyContext {
    return this.chain(target)[0]!;
  }

  chain(target: Element | null): KeyContext[] {
    const owner = target?.closest(`[${this.attr}]`);
    const named = owner?.getAttribute(this.attr)?.split(/\s+/).filter(Boolean) ?? [];
    return (named.length > 0 ? named : ['global']) as KeyContext[];
  }

  here(): KeyContext {
    return this.of(this.focused());
  }

  hereChain(): KeyContext[] {
    return this.chain(this.focused());
  }

  private focused(): Element | null {
    return typeof document === 'undefined' ? null : document.activeElement;
  }
}

export const keyContexts = new KeyContexts();
