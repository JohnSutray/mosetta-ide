/**
 * The shape of a column.
 *
 * The key is called `panel` rather than `layout.column` or `view.slot`. A column, a tab
 * and a tile are DIFFERENT PRESENTATIONS OF A PANEL rather than presentations of some
 * third entity; generalising the name in advance means ending up with a key nobody can
 * read aloud.
 *
 * Half the fields are declared with an empty schema: those hold a signal and render
 * functions. There is nothing to validate in them, but there is no need to lie about
 * them either — a key with such fields has no business being persistent.
 */

export const PANEL_SCHEMA = {
  type: 'object',
  required: ['id', 'title', 'side', 'open', 'view'],
  properties: {
    id: { type: 'string' },
    /** A dictionary key for the title, not a ready-made string. */
    title: { type: 'string' },
    side: { type: 'string', enum: ['left', 'main', 'right'] },
    open: {},
    view: {},
    heading: {},
    badges: {},
    close: {},
    defaultWidth: { type: 'number', minimum: 80 },
    minWidth: { type: 'number', minimum: 80 },
  },
  additionalProperties: false,
} as const;

export interface PanelWish {
  id: string;
  /** A dictionary key. The panel's permanent name. */
  title: string;
  /**
   * Navigation to the left, working panels to the right, `main` the remainder in the
   * middle.
   */
  side: 'left' | 'main' | 'right';
  open: { readonly value: boolean };
  view: () => unknown;
  /**
   * The title when it is not permanent: for the editor this is the open file's path,
   * and a path is not a dictionary key. Returned empty means we show `title`.
   */
  heading?: () => string | null;
  /** What to draw on the right of the header: marks, counters, the panel's buttons. */
  badges?: () => unknown;
  /** The cross. Absent means there is no cross: not every column can be closed. */
  close?: () => void;
  defaultWidth?: number;
  minWidth?: number;
}

/**
 * A neighbour's action in ANOTHER panel's HEADER.
 *
 * A panel has had `badges` from the start, but they are written by the panel's OWNER,
 * and a neighbour has nothing to put theirs in with: the debugger had nowhere to place
 * "run" and "debug" next to the open file's name. The `panel.action` key is that slot:
 * the neighbour brings a DESCRIPTION (an icon, a tooltip, keys, what to do) and the
 * layout draws it — as the toolbar draws a badge.
 */
export const PANEL_ACTION_SCHEMA = {
  type: 'object',
  required: ['id', 'panel', 'title', 'icon', 'run'],
  properties: {
    id: { type: 'string' },
    /** Which panel's header to stand in: its `id` from the `panel` key. */
    panel: { type: 'string' },
    /**
     * A dictionary key belonging to WHOEVER added the action: the dictionaries are
     * merged.
     */
    title: { type: 'string' },
    icon: {},
    keys: {},
    run: {},
    enabled: {},
  },
  additionalProperties: false,
} as const;

export interface PanelAction {
  id: string;
  panel: string;
  title: string;
  icon: () => unknown;
  /** The keys for the tooltip: known to whoever declared the command. */
  keys?: () => string[];
  run: () => void;
  /**
   * When the action makes sense. Empty means always. A disabled one explains itself
   * through its tooltip.
   */
  enabled?: () => boolean;
}

/**
 * Cover the MIDDLE.
 *
 * A file's diff is shown over the editor rather than instead of it or beside it: beside
 * means one more column, i.e. the editor squeezed in half for a two-second look;
 * instead means losing the place the human was looking at. Covered, looked at, taken
 * away — the editor stayed as it was.
 *
 * The key is about the MIDDLE rather than about a panel by name (as `panel.action` is):
 * a neighbour wants to cover "the place where a file is shown", and who is there right
 * now — the editor, an image view, or nothing at all — is not their business. The
 * layout draws it: it alone knows where that middle is, and the overlay lands exactly
 * on it without a single DOM measurement.
 */
export const MAIN_OVERLAY_SCHEMA = {
  type: 'object',
  required: ['id', 'title', 'open', 'view', 'close'],
  properties: {
    id: { type: 'string' },
    /** A dictionary key: the permanent name of whatever is covering. */
    title: { type: 'string' },
    /** The impermanent part of the title — a file's path, for instance. */
    heading: {},
    /** What to draw in the header left of the cross: a mode switch, counters. */
    badges: {},
    open: {},
    view: {},
    close: {},
    /** The key surface this counts as. */
    keys: { type: 'string' },
    /** Whether to take the keyboard on birth. Yes by default. */
    takesFocus: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

export interface MainOverlay {
  id: string;
  title: string;
  heading?: () => string | null;
  /**
   * The overlay has a header of its own, and there is room in it: a neighbour puts a
   * mode switch there — as a panel's owner puts marks into `badges`. A second strip
   * below the header has nowhere to come from: it would eat height from precisely the
   * thing the overlay was opened for.
   */
  badges?: () => unknown;
  open: { readonly value: boolean };
  view: () => unknown;
  close: () => void;
  keys?: string;
  /**
   * Whether to take the keyboard. Yes by default — otherwise Escape would go to
   * whatever lies UNDER the overlay. But if the overlay is opened by a CLICK on a list,
   * the keyboard belongs to the list: people walk it with arrows and search it by
   * letter, and taking that away on every view means breaking what they came to the
   * list for.
   */
  takesFocus?: boolean;
}
