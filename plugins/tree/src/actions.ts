export const TREE_ACTION_SCHEMA = {
  type: 'object',
  required: ['id', 'title', 'opens', 'run'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    opens: {},
    run: {},
  },
  additionalProperties: false,
} as const;

export interface TreeAction {
  id: string;
  title: string;
  opens: (path: string, isDir: boolean) => boolean;
  run: (path: string) => void;
}
