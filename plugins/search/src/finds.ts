import type { FindProvider } from './types.js';

/**
 * Who can find what.
 *
 * The index does not know WHAT it indexes: the kinds are brought by suppliers, and
 * `npm` is one of them, arriving with the scripts plugin. The registry used to live in
 * the core; now it is a field of the search server half, and a neighbour puts a
 * supplier in through `getPlugin(SearchServer).find(...)`.
 *
 * An OBJECT rather than a module-level list: the registry has an owner, and a test can
 * assemble its own with one fake supplier.
 */
export class FindProviders {
  private readonly list: FindProvider[] = [];

  add(provider: FindProvider): void {
    const taken = this.list.find((item) => item.kind === provider.kind);
    if (taken) {
      throw new Error(`the hit kind «${provider.kind}» is already taken`);
    }
    this.list.push(provider);
  }

  all(): readonly FindProvider[] {
    return this.list;
  }

  /** The kinds that exist at all: the query parser knows them. */
  kinds(): string[] {
    return this.list.map((item) => item.kind);
  }

  /** Whether there is at least one that finds this file interesting. */
  wants(path: string): boolean {
    return this.list.some((item) => item.wants(path));
  }
}
