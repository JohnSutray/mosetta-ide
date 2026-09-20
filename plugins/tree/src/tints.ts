import type { RegistryHandle } from '@mosetta/ide-api/client';

/**
 * The colour of a name in the tree.
 *
 * The colour means exactly one thing — git status — and git is a separate plugin, and
 * the tree knows nothing about it. Between them lies the `tree.tint` registry key:
 * anyone writes "here are my colours" into it, and the tree reads everyone and paints.
 * No git means no colours, and that is honest: a tree without git is grey rather than
 * broken.
 *
 * The key is declared by THE TREE — whoever reads it. The core used to do that on its
 * behalf; now the core has no reason to know about this key.
 *
 * Three values, and all three are about a file: "changed", "new", "conflict". A
 * directory has one rule: blue if there is a painted file inside. That rule is applied
 * by the WRITER: the tree does not know a directory turns blue because of a file
 * inside, it simply asks for a colour by path.
 */
export type TreeTint = 'modified' | 'added' | 'conflict';

/** What goes into `tree.tint`: the source, and its map of path to colour. */
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
  /**
   * The key's handle arrives through the constructor: the tree has no registry of its
   * own.
   */
  constructor(private readonly sources: RegistryHandle<TintSource>) {}

  /** The first who knows this path's colour. Usually there is one source. */
  of(path: string): TreeTint | undefined {
    for (const source of this.sources.all.value) {
      const tint = source.tint.value.get(path);
      if (tint) return tint;
    }
    return undefined;
  }
}
