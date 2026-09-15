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

export const VIEW_SCHEMA = {
  type: 'object',
  required: ['id', 'opens', 'view'],
  properties: {
    id: { type: 'string' },
    opens: {},
    text: {},
    view: {},
  },
  additionalProperties: false,
} as const;

export interface FileView {
  id: string;
  opens: (path: string) => boolean;
  text?: boolean;
  view: (file: { path: string; text: string }, editor: () => unknown) => unknown;
}
