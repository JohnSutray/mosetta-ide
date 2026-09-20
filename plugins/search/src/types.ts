
/** A hit's kind: `file`, `ts`, `npm`… An open set — the kinds are brought by suppliers. */
export type IndexKind = string;

/** The kinds the index can do itself. Everything else is brought by suppliers. */
export const OWN_KINDS = ['file', 'ts'] as const;

export interface IndexHit {
  kind: IndexKind;
  /** The string that is searched, and that the human sees. */
  label: string;
  /** The file a hit leads to. */
  path: string;
  /** The line in the file (zero-based) — for symbols. */
  line?: number;
  /** An explanation on the right: a script's command, a file's directory. */
  detail?: string;
  /**
   * A hit's tags — what it can be FILTERED by, typed as a word. The kind of a symbol
   * used to arrive as a dictionary key and was shown before the explanation; now it is
   * a tag, and so it can not only be read but typed: `ts function fit`.
   *
   * Tags are not translated, unlike a section's heading: they are typed, and one types
   * what one has seen. A hit's kind is not written as a tag — it is a tag by itself,
   * with no declaration.
   */
  tags?: string[];
  /**
   * What can be DONE with a hit besides "open the file": for a script that is its id
   * (`@distrojs/core::dev`), which is also the terminal's name. Taking the label apart
   * again on the client would be guesswork.
   */
  id?: string;
  /** More means a better match. */
  score: number;
  /** The positions of the matched characters in the label — for highlighting. */
  matches: number[];
}

export interface SearchStats {
  files: number;
  /** How many hits the suppliers gave — every kind together. */
  provided: number;
  symbols: number;
  /** How many words the index learned from the project itself. */
  vocabulary: number;
  /** Files not parsed yet: symbols appear in the background. */
  pending: number;
  /**
   * Files that COULD HAVE symbols but do not and never will.
   *
   * Symbols are parsed only for what lies in memory, and memory is bounded by the
   * preload budget. On a large project that means "search everywhere" knows less than
   * there is — and staying silent about it is not on: an empty list is
   * indistinguishable from "no such symbol exists". The pending ones are not included
   * here: those files are in progress, while these were skipped.
   */
  unparsed: number;
}

/**
 * The index's answer: the hits, and how many there were BEFORE the ceiling.
 *
 * A bare list used to be handed over, and the window showed its length as the number of
 * hits. Fifty out of three hundred looked exactly like all fifty there are — that is,
 * the ceiling lied every time it fired.
 */
export interface SearchAnswer {
  hits: IndexHit[];
  /** How many matched in total; more than the hits' length means we hit the ceiling. */
  total: number;
}

/**
 * A search hit as a supplier gives it.
 *
 * A supplier has no disk reading of its own and cannot have: the text is brought by the
 * index, because the truth for it is memory rather than a file.
 */
export interface Found {
  /** The string without the kind's prefix: `@mosetta/ide-client::build`. */
  label: string;
  /** Where the hit leads. By default the file it was taken from. */
  path?: string;
  /** The line in the file, zero-based. */
  line?: number;
  /** An explanation on the right: a script's command, a symbol's kind. */
  detail?: string;
  /** What can be DONE with a hit besides "open the file". */
  id?: string;
}

/** A supplier of hits: "these are the files I parse and this is what I give from them". */
export interface FindProvider {
  /** The kind of hits: also the prefix of the search string (`npm::…`). */
  kind: string;
  /** Whether we parse this file. The path is relative to the project root. */
  wants(path: string): boolean;
  /** What this file gives. A corrupt file means an empty list rather than an exception. */
  finds(path: string, text: string): Found[];
}

/** What goes into `search.opener`: "I open hits of this kind". */
export interface Opener {
  kind: IndexKind;
  open(found: { path: string; id?: string }): void;
}

export const OPENER_SCHEMA = {
  type: 'object',
  required: ['kind', 'open'],
  additionalProperties: false,
  properties: { kind: { type: 'string' }, open: {} },
} as const;

/**
 * A source's tag: a name, and optionally a short name for it. As a string when there is
 * nothing to shorten.
 */
export type TagSpec = string | { name: string; short: string };

export interface SearchAsk {
  /** What is being searched for. Empty means "show me what you have". */
  term: string;
  /** The query's tags. Only whoever promises them (`tags()`) is asked. */
  tags: string[];
  /** How many rows will fit. The window cuts anyway — this is a request. */
  limit: number;
}

export interface SearchSource {
  id: string;
  /** The kind of hits: also the key of the section's heading, and the opener's address. */
  kind: IndexKind;
  /**
   * Find. A source's refusal is suppressed: somebody else's breakage does not bring the
   * search down, it merely adds no hits.
   *
   * AN EMPTY TERM is a legitimate question, and the answer to it depends on the tags:
   *
   * * `term: ''` with no tags — everybody is asked in turn when the window opens. Only whoever finds emptiness meaningful answers (recent files); the rest stay silent — otherwise a double Shift would dump every setting at once. And they stay silent AT ONCE, without going outwards: a trip into a child process for emptiness would be paid for on every opening of the window;
   * * `term: ''` with tags (`ts class `) — "show me what you have of that". Here emptiness has been asked for explicitly, and staying silent in reply is not on: the human typed a tag in order to look rather than to see an empty list. The order is its own and the score zero — the window will put whatever turned up more often in past searches first.
   *
   * When scoring a match with the search matcher, the query is FOLDED first
   * (`textIndex.fold`) — otherwise a capital letter finds nothing.
   */
  find(ask: SearchAsk): Promise<IndexHit[]> | IndexHit[];
  /**
   * Which tags a source marks its hits with.
   *
   * A declaration rather than a guess: by it the search does NOT ASK a source that
   * certainly will not answer (`ts fit` does not disturb the terminals) — the same
   * economy as a disabled chip — and by it one can also see that a tag nobody knows was
   * typed in vain. The kind need not be written here: it is a tag anyway.
   *
   * A tag may have a SHORT name (`class` → `c`, `function` → `fn`): a tag is typed, and
   * typing a whole word for the sake of a filter takes too long. The window expands the
   * short one BEFORE asking — the source receives the full name and knows nothing of
   * the abbreviations.
   */
  tags?(): TagSpec[];
  /**
   * What a source does NOT know — as a line under the field. A dictionary key with
   * parameters rather than a ready string: labels are data, and whoever shows them
   * translates them. Empty means we stay silent: silence is truthful when the coverage
   * is complete.
   */
  note?(): { key: string; params?: Record<string, string | number>; setting?: string } | null;
}

export const SOURCE_SCHEMA = {
  type: 'object',
  required: ['id', 'kind', 'find'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, kind: { type: 'string' }, find: {}, note: {}, tags: {} },
} as const;

/**
 * What goes into `search.icon`: "I draw the icon for hits of this kind".
 *
 * The third mirror of `search.opener`. The user's rule: every element of the interface
 * should have an icon, and a results row is an element. But the KIND is not known to
 * the search: `ts` means a TypeScript symbol only to the plugin that brought those
 * symbols, and a table of kinds in the search would be exactly the closed set that was
 * walked away from.
 *
 * Whatever is not in the key the search draws itself, by one rule: a hit with a path to
 * a file gets the file's icon — the same as in the tree. A hit without a file gets
 * nothing: a sheet of paper under a setting would assert an untruth.
 */
export interface KindIcon {
  kind: IndexKind;
  /** THIS hit's icon: a symbol's kind is visible from its tags. */
  icon(hit: IndexHit): unknown;
}

export const ICON_SCHEMA = {
  type: 'object',
  required: ['kind', 'icon'],
  additionalProperties: false,
  properties: { kind: { type: 'string' }, icon: {} },
} as const;

/**
 * A view of its own for a file — as a SHAPE rather than by import.
 *
 * The `file.view` key is declared by the editor, and we need one thing from it: what to
 * show the chosen file with in the preview. An import would make the editor mandatory
 * for the search, which is untrue — the "search everywhere" window works without a
 * middle too.
 */
export interface FileViewLike {
  id: string;
  opens(path: string): boolean;
  /** Whether text is needed. `false` means an image: it has no text at all. */
  text?: boolean;
  view(file: { path: string; text: string }, editor: () => unknown): unknown;
}
