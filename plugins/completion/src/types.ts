import type { CompletionKind, Range } from '@ide/plugin-lsp';

export type ItemKind = CompletionKind | 'word' | 'postfix';

export interface Ask {
  path: string;
  text: string;
  pos: number;
  from: number;
  line: number;
  character: number;
  trigger: string | null;
  explicit: boolean;
}

export interface Details {
  detail?: string;
  documentation?: string;
  edits: Array<{ range: Range; text: string }>;
}

export interface Item {
  label: string;
  kind: ItemKind;
  source: string;
  insert?: string;
  from?: number;
  caret?: number;
  filter?: string;
  detail?: string;
  rank?: number;
  deprecated?: boolean;
  resolve?: () => Promise<Details>;
}

export interface Answer {
  items: Item[];
  incomplete?: boolean;
}

export interface Source {
  id: string;
  weight: number;
  items(ask: Ask): Answer | Promise<Answer>;
}

export const SOURCE_SCHEMA = {
  type: 'object',
  required: ['id', 'weight', 'items'],
  properties: {
    id: { type: 'string' },
    weight: { type: 'number' },
    items: {},
  },
} as const;
