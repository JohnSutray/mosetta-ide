import type { JSX } from 'preact';

/**
 * A symbol's icon for "search everywhere".
 *
 * A hit's kind is drawn by whoever brought it (the `search.icon` key): search does not
 * know the word "interface" and should not. The form is a plate with a letter, the same
 * as a file icon for languages: symbols are not depicted by a drawing, they are
 * recognised by their letter and colour, as in IDEA.
 *
 * The table is here rather than in the theme's palette: this is not a colour of CODE
 * but an identifying mark for a kind — exactly like the table of file types for the
 * tree's icons.
 */
const MARKS: Record<string, { mark: string; color: string; short: string }> = {
  function: { mark: 'f', color: '#9876aa', short: 'fn' },
  method: { mark: 'm', color: '#9876aa', short: 'm' },
  class: { mark: 'C', color: '#cc7832', short: 'c' },
  interface: { mark: 'I', color: '#6a8759', short: 'i' },
  type: { mark: 'T', color: '#4f9da6', short: 't' },
  enum: { mark: 'E', color: '#bbb529', short: 'e' },
  'enum-member': { mark: 'e', color: '#bbb529', short: 'em' },
  property: { mark: 'p', color: '#6897bb', short: 'p' },
  variable: { mark: 'v', color: '#6897bb', short: 'v' },
};

const UNKNOWN = { mark: '?', color: '#6e7376', short: '?' };

/**
 * The kinds of symbol as a LIST — the same one the icons are drawn from. It is also the
 * tags we mark hits with: two lists would drift apart on the first new kind, and the
 * icon would silently become a question mark.
 */
export const SYMBOL_KINDS = Object.keys(MARKS);

/**
 * The kinds as TAGS, with short names: `class` → `c`, `function` → `fn`. The user's
 * rule — a tag is typed, and typing a whole word for the sake of a filter takes too
 * long. The short name lies in the same table as the icon and the colour: a third list
 * would drift from the first two on the first new kind.
 */
export const SYMBOL_TAGS = Object.entries(MARKS).map(([name, one]) => ({ name, short: one.short }));

export function SymbolIcon({ kind }: { kind: string }): JSX.Element {
  const { mark, color } = MARKS[kind] ?? UNKNOWN;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" shape-rendering="geometricPrecision">
      <rect x="1.6" y="1.6" width="12.8" height="12.8" rx="3" fill="none" stroke={color} stroke-width="1.2" />
      <text
        x="8"
        y="8.6"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="'SF Mono', Menlo, monospace"
        font-size="8.4"
        font-weight="700"
        fill={color}
      >
        {mark}
      </text>
    </svg>
  );
}
