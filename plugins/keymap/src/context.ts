import type { KeyContext } from './types.js';

/** The attribute a surface names its context with. */
export class KeyContexts {
  /** What a surface calls itself. One attribute for the whole interface. */
  readonly attr = 'data-keys';

  of(target: Element | null): KeyContext {
    return this.chain(target)[0]!;
  }

  /**
   * The whole chain a surface names itself by.
   *
   * `data-keys="completion editor"` means "my keys first, and whatever I do not have —
   * as in the editor". An open completion list lives inside the editor and takes four
   * keys from it rather than all of them: without the chain, Cmd+Z while the list is
   * open would find no row at all. The kinship is named by the surface itself rather
   * than deduced from the nesting — the search field lies inside the editor too, but
   * its keys are not the editor's.
   */
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

/** One per tab. The IDE's root object will become its owner. */
export const keyContexts = new KeyContexts();
