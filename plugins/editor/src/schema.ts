export const EMPTY_SCHEMA = {
  type: 'object',
  required: ['id', 'view'],
  properties: {
    id: { type: 'string' },
    view: {},
  },
  additionalProperties: false,
} as const;

export interface EmptyView {
  id: string;
  view: () => unknown;
}
