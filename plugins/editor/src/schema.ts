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

export const EXTENSION_SCHEMA = {
  type: 'object',
  required: ['id', 'extension'],
  properties: {
    id: { type: 'string' },
    extension: {},
  },
  additionalProperties: false,
} as const;

export interface EditorExtension {
  id: string;
  extension: unknown;
}
