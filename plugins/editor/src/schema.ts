/**
 * What to fill the empty middle with.
 *
 * The key is declared by the EDITOR rather than by the core, and that is exactly the
 * same reasoning as with the toolbar: an empty space exists only where there is an
 * editor. Tear it down with the plugin and the question of what to fill the emptiness
 * with goes with it.
 */
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

/**
 * A CodeMirror extension from a neighbour. Find-in-file, and tomorrow hints and
 * snippets, are extensions of the editor, and they are brought by the plugin whose
 * feature they are. The live `EditorView` is still not handed outwards: an extension
 * receives it itself, as an extension should.
 */
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

/**
 * One more answer to a hover. The language server answers with a type; the debugger,
 * while stopped, with a value; tomorrow somebody will answer with documentation. Each
 * as an entry in a key, while the card is assembled by the editor: every answer in one
 * plate, the debugger first (while stopped, the value matters more than the type).
 */
export const HOVER_SCHEMA = {
  type: 'object',
  required: ['id', 'hover'],
  properties: {
    id: { type: 'string' },
    hover: {},
  },
  additionalProperties: false,
} as const;

export interface HoverSpot {
  path: string;
  /** Zero-based, as with the language server. */
  line: number;
  character: number;
  /** The whole line: the word or the expression under the cursor is taken out of it. */
  text: string;
}

export interface HoverSource {
  id: string;
  /**
   * `null` means there is nothing to say; `code` is painted with the file's
   * highlighting.
   */
  hover: (spot: HoverSpot) => Promise<{ code: string } | null>;
}

/**
 * A VIEW OF ITS OWN FOR A FILE.
 *
 * The middle shows a file — but "a file" and "text in CodeMirror" are not the same
 * thing. An image is shown as an image, markup can be shown as a finished page, and
 * tomorrow somebody will want to show a `.csv` as a table. The key exists precisely so
 * that such a view arrives as a PLUGIN and can be added indefinitely without touching
 * the editor.
 *
 * Two fields decide everything else:
 *
 * * `opens(path)` — whether this view takes such a file on. We ask by name rather than by contents: choosing a view is a choice rather than a sentence (contents decide a different question — whether a file is text).
 * * `text` — whether a DOCUMENT is needed. Markup needs one (it is both edited and shown), an image does not: a binary does not become a document at all, and asking for one would yield a comprehensible error instead of a picture.
 *
 * `view` receives `editor()` as its second argument — "draw an ordinary editor". A view
 * is entitled not to call it (an image), to call it instead of itself (markup in "text"
 * mode) or to put it beside itself ("text and view" mode). The live `EditorView` is
 * still not handed outwards: what is handed out is a REQUEST to draw it.
 */
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
  /** Whether the view takes such a file on — by name. */
  opens: (path: string) => boolean;
  /** Whether the document's text is needed. Empty means it is: everyone can show text. */
  text?: boolean;
  /**
   * What to show it with; `editor()` draws an ordinary code editor.
   *
   * The TEXT arrives as an argument rather than being taken from the document. A view
   * is drawn not only in the middle: the same window is needed by the "search
   * everywhere" preview, and there is no open document there at all — so a view
   * reaching for text from a neighbour would draw ANOTHER file's text. A view that did
   * not ask for text gets an empty string here.
   */
  view: (file: { path: string; text: string }, editor: () => unknown) => unknown;
}
