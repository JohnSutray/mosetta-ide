/**
 * A neighbour's action on a file in the tree.
 *
 * A mirror of `scripts.action`: there a neighbour adds a bug to a script's row, here an
 * item to a file's context menu. The tree knows nothing about the debugger and should
 * not; it knows that a row may have foreign actions, and asks each of them whether it
 * takes this path on.
 */
export const TREE_ACTION_SCHEMA = {
  type: 'object',
  required: ['id', 'title', 'opens', 'run'],
  properties: {
    id: { type: 'string' },
    /**
     * A dictionary key belonging to WHOEVER added the item: the plugins' dictionaries
     * are merged.
     */
    title: { type: 'string' },
    opens: {},
    run: {},
  },
  additionalProperties: false,
} as const;

export interface TreeAction {
  id: string;
  title: string;
  /** Whether it takes this path on. A directory is usually told no. */
  opens: (path: string, isDir: boolean) => boolean;
  run: (path: string) => void;
}
