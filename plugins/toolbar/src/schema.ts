/**
 * The shape of what goes into the toolbar's registry.
 *
 * JSON Schema, i.e. DATA: it can be shown in a window, kept next to the settings, and
 * used to validate a file written by hand. Fields holding non-JSON — an icon is a
 * function, a state is a signal — are declared with an empty schema: there is nothing
 * to validate there, but there is no need to lie about them either.
 *
 * The key is called `toolbar.*` rather than something more abstract. A spotlight grid
 * instead of a strip is ANOTHER PRESENTATION OF THE TOOLBAR rather than a presentation
 * of some third entity; generalising the name in advance means ending up with a key
 * nobody can read aloud.
 */

export const BUTTON_SCHEMA = {
  type: 'object',
  required: ['id', 'title', 'command'],
  properties: {
    id: { type: 'string' },
    /** A dictionary key for the tooltip, not a ready-made string. */
    title: { type: 'string' },
    command: { type: 'string' },
    icon: {},
    active: {},
    visible: {},
    badge: {},
  },
  additionalProperties: false,
} as const;

export const WIDGET_SCHEMA = {
  type: 'object',
  required: ['id', 'side'],
  properties: {
    id: { type: 'string' },
    side: { type: 'string', enum: ['left', 'right'] },
    view: {},
    chip: {},
  },
  additionalProperties: false,
} as const;

/** A button: an icon, a command, a state. It is numbered, hence uniform. */
export interface ToolbarButton {
  id: string;
  title: string;
  command: string;
  icon: (filled: boolean) => unknown;
  /**
   * Whether the feature is open. Absent means the button is an action, with nothing to
   * highlight.
   */
  active?: { readonly value: boolean };
  /** When the button has a place in the strip at all. Empty means always. */
  visible?: { readonly value: boolean };
  /** A number on the button: how many are left. */
  badge?: { readonly value: number };
}

/**
 * A BADGE — how a neighbour answers the question "what are we working with right now
 * and what happens if I press this".
 *
 * Not a component but a DESCRIPTION: the toolbar draws it, and that is why the git
 * branch, the shell, the package manager, the language server's sweep and the daemon's
 * memory look alike by construction rather than by agreement. Each of them used to draw
 * its own button, and one row held five presentations of one and the same thing,
 * differing exactly in the order they were written.
 *
 * `icon` and `tip` are MANDATORY, and that is the point of this type. A badge without
 * an icon is identified only by reading; a badge without a tooltip does not explain
 * what its words mean or where a click leads. The requirement is recorded in the type
 * rather than in vigilance: forgetting is impossible.
 */
export interface ToolbarChip {
  /** A render key for when there are several badges: per server, per project. */
  id?: string;
  /** The icon: what this is about, read before the words. */
  icon: unknown;
  /** What this is at all and what happens on a click — as a ready string. */
  tip: string;
  /** The action's keys — as separate caps in the tooltip. */
  keys?: string[];
  /** Words or numbers: the value rather than the name. */
  text: unknown;
  /** A second number — muted, after a separating dot. */
  more?: unknown;
  /**
   * The colour speaks of STATE: `warn` means we hit a limit the human set themselves,
   * `bad` means broken and not working at all.
   */
  tone?: 'plain' | 'warn' | 'bad';
  /** Work is in progress: it blinks faintly — this is not a result yet. */
  busy?: boolean;
  /** There is nothing to press — the badge stays a readout rather than a button. */
  onClick?: () => void;
}

/**
 * A widget: anything with a shape of its own — terminal chips, a branch, a shell.
 *
 * The toolbar does not know what a terminal or a branch is, and should not: it is
 * handed a render function rather than data. Which is why moving the toolbar out of the
 * core required opening neither terminals nor git to plugins.
 *
 * Two ways, and the second is deliberately narrow: `chip` describes a badge as data,
 * and then its shape, size, tooltip and behaviour are the toolbar's. `view` remains for
 * what is not a badge — the list of terminal chips, for instance. Markup of your own
 * where a shape of your own is needed, rather than where somebody happened to reach for
 * it first.
 */
export interface ToolbarWidget {
  id: string;
  side: 'left' | 'right';
  view?: () => unknown;
  /**
   * A badge as data; `null` means there is nothing to say right now, and we stay
   * silent. A list is for when there are EXACTLY as many badges as there are things:
   * there can be several language servers, and adding their numbers up would mean
   * naming a number that does not exist.
   */
  chip?: () => ToolbarChip | ToolbarChip[] | null;
}
