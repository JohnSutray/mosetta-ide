import { computed, type ReadonlySignal } from '@preact/signals';
import type { Registry } from './registry.js';

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
  private all: ReadonlySignal<TintSource[]> = computed(() => []);

  watch(store: Registry): void {
    this.all = store.all<TintSource>('tree.tint');
  }

  of(path: string): TreeTint | undefined {
    for (const source of this.all.value) {
      const tint = source.tint.value.get(path);
      if (tint) return tint;
    }
    return undefined;
  }
}

export const treeTints = new TreeTints();
