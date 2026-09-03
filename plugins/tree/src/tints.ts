import type { RegistryHandle } from '@ide/api/client';

export type TreeTint = 'modified' | 'added' | 'conflict';

export interface TintSource {
  id: string;
  tint: { readonly value: ReadonlyMap<string, TreeTint> };
}

export const TINT_SCHEMA = {
  type: 'object',
  required: ['id', 'tint'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, tint: {} },
} as const;

export class TreeTints {
  constructor(private readonly sources: RegistryHandle<TintSource>) {}

  of(path: string): TreeTint | undefined {
    for (const source of this.sources.all.value) {
      const tint = source.tint.value.get(path);
      if (tint) return tint;
    }
    return undefined;
  }
}
