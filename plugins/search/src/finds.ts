import type { FindProvider } from './types.js';

export class FindProviders {
  private readonly list: FindProvider[] = [];

  add(provider: FindProvider): void {
    const taken = this.list.find((item) => item.kind === provider.kind);
    if (taken) {
      throw new Error(`сорт находок «${provider.kind}» уже занят`);
    }
    this.list.push(provider);
  }

  all(): readonly FindProvider[] {
    return this.list;
  }

  kinds(): string[] {
    return this.list.map((item) => item.kind);
  }

  wants(path: string): boolean {
    return this.list.some((item) => item.wants(path));
  }
}
