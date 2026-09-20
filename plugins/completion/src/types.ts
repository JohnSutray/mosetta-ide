import type { CompletionKind, Range } from '@mosetta/ide-plugin-lsp';

/** An item's kind: the language server's kinds plus two of our own. */
export type ItemKind = CompletionKind | 'word' | 'postfix';

/** What a source knows about the place it was asked at. */
export interface Ask {
  path: string;
  /** The document's whole text at the moment of the question. */
  text: string;
  /** The caret — an offset in the text. */
  pos: number;
  /** Where the word being typed begins; after a dot, right after it. */
  from: number;
  /** The caret's line and column, zero-based — as in LSP. */
  line: number;
  character: number;
  /** The character that opened the list (a dot), or nothing — a letter, or a key. */
  trigger: string | null;
  /** Called by key rather than by typing. */
  explicit: boolean;
}

/** Read in lazily, for the selected item. Lines and columns as in LSP. */
export interface Details {
  detail?: string;
  documentation?: string;
  /** Edits beyond the insertion — an import line. */
  edits: Array<{ range: Range; text: string }>;
}

export interface Item {
  label: string;
  kind: ItemKind;
  /** Who brought it: the group's weight comes from that. */
  source: string;
  /** What to insert; absent means `label` is inserted. */
  insert?: string;
  /**
   * Where to replace from, if not from the word's start: a postfix takes the expression
   * on the left.
   */
  from?: number;
  /** Where the caret will land inside the insertion; absent means at the end. */
  caret?: number;
  /** What to filter by, if not by `label`. */
  filter?: string;
  /** Briefly, on the right: the type, the module, what the template expands into. */
  detail?: string;
  /** The tier from the checker: 0 is local, then a member, global, an import. */
  rank?: number;
  deprecated?: boolean;
  /** Read in the documentation and the import — lazily, for the selected one. */
  resolve?: () => Promise<Details>;
}

export interface Answer {
  items: Item[];
  /** The source asks to be re-asked on every letter. */
  incomplete?: boolean;
}

/**
 * An entry in the `completion.source` key. A synchronous source is obliged to answer
 * synchronously: the first frame rests on that — the list opens non-empty before the
 * language server has answered.
 */
export interface Source {
  id: string;
  /** The group's weight: the checker knows more than the buffer's words. */
  weight: number;
  items(ask: Ask): Answer | Promise<Answer>;
}

/** The shape of an entry in the `completion.source` key — declared by this plugin. */
export const SOURCE_SCHEMA = {
  type: 'object',
  required: ['id', 'weight', 'items'],
  properties: {
    id: { type: 'string' },
    weight: { type: 'number' },
    items: {},
  },
} as const;
