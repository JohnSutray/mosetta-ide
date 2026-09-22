
/**
 * Where a key has force. An empty `when` = everywhere.
 *
 * This is the COMPLETE list of surfaces that have keys of their own — a registry rather
 * than a hint. The context is taken from the element the OS focus is on right now:
 * every surface names itself with the `data-keys` attribute, and a key assigned to one
 * cannot fire in another.
 *
 * A key assigned to a context is stronger than a global one with the same chord. That
 * is why Enter in a modal confirms it rather than opening a file in the tree behind.
 */
export type KeyContext =
  | 'global'
  | 'editor'
  | 'tree'
  | 'search'
  | 'projects'
  | 'pick'
  /** The question modal: "what to call it" and "delete, really". */
  | 'prompt'
  /** The branch name field inside the branches popup: the list does not override its keys. */
  | 'branch-name'
  /** A drop-down menu: while it is open the arrows and Enter belong to it. */
  | 'menu'
  /** The push window. */
  | 'push'
  /** The terminal: every key there is its own, including the ones we might have taken. */
  | 'terminal'
  /** The keys cheat sheet: it takes no keys itself, but it does catch the echo. */
  | 'keys'
  /**
   * The layout editor's trap: this is pressed into in order to ASSIGN a chord. The keys
   * are swallowed whole — otherwise assigning Cmd+S would save the file along the way —
   * and what was pressed is visible in the echo.
   */
  | 'keymap-edit'
  /** The conflict resolution screen. */
  | 'merge'
  /**
   * The changes panel: the message field is multi-line, so Enter belongs to it while the
   * commit hangs on Cmd+Enter, as in WebStorm.
   */
  | 'changes'
  /**
   * A file's diff covering the editor. It needs a name of its own for the sake of one
   * key: the editor lies underneath it, and a nameless Escape would close something
   * other than what the user is looking at.
   */
  | 'diff'
  /** The settings editor: the fields edit text, the keys belong to the field. */
  | 'settings'
  /** The find field in a file: Enter searches on, Escape closes. */
  | 'find'
  /** The breakpoint condition window: Enter applies. */
  | 'debug-edit'
  /**
   * A multi-line search field: Enter puts a line break there rather than searching on. A
   * context of its own, because the layout is data: one row cannot mean different things
   * depending on the state of the window.
   */
  | 'find-multiline'
  /** The replace field in the same place: Enter replaces the current one. */
  | 'find-replace'
  /** The project search popup: the arrows, Enter, Tab, Escape. */
  | 'find-files'
  /** The masks field in it: Enter adds a chip. */
  | 'find-files-mask'
  /**
   * An open completion list: the arrows, Enter, Tab and Escape are its own. The surface
   * names itself with the chain `completion editor`, so the rest of the keys stay with
   * the editor: Cmd+Z with the list open still undoes.
   */
  | 'completion'
  /**
   * ANY input field — on top of its own context. A surface does not name itself that:
   * the context comes from the sheer fact that the focus is in an `<input>` or a
   * `<textarea>`. The rows with it say which chords the field keeps for itself
   * (`field.native`): undo, the caret by words, the edge of a line.
   */
  | 'editable';

/** The environment the front end runs in: they have different keys taken away. */
export type KeyHost = 'browser' | 'electron';

/**
 * The operating system. It is the system that takes keys away, not only the
 * environment.
 */
export type KeyOs = 'mac' | 'win' | 'linux';

/**
 * Where exactly the key is unavailable. Either axis alone is too little: Cmd+1 is taken
 * by the browser, Control+arrow by macOS, and Ctrl+T on Windows by the browser again,
 * but only there. So a scope is either a whole environment or an "environment on
 * such-and-such an OS" pair.
 */
export type KeyScope = KeyHost | `${KeyHost}:${KeyOs}`;

export interface KeyBinding {
  /**
   * A command's id. NOT `CommandId`: with plugins the set of commands stopped being a
   * closed one, and pretending that it is closed means lying with a type. That such a
   * command exists is checked by a test, across the plugins' sources.
   */
  command: string;
  /**
   * A chord of PHYSICAL keys: `meta` (Cmd or Win), `control`, `alt` (Option), `shift`,
   * and the name of the key itself. The order of the parts is always this one.
   *
   * Roles like `mod` are no longer here. They saved rows at the cost of clarity: one
   * and the same string meant different keys in different environments, and reading the
   * layout without holding a table of roles in your head was impossible.
   *
   * The special form `double:<key>` is a double press of a bare modifier in a row: a
   * rhythm rather than a chord.
   */
  key: string;
  /** The surface where the key has force. Empty means everywhere. */
  when?: KeyContext;
  /**
   * Remove a factory row. The layout is layered: the factory one is the package's data,
   * personal differences are the `keymap` section in `settings.json`. A personal row
   * with the same chord REPLACES the factory one, while a row with `remove` takes it
   * away: otherwise there would be nothing to "take a key away from the IDE" with,
   * short of editing the shipment.
   */
  remove?: true;
  /**
   * The environments the row applies in. Empty means all of them.
   *
   * There are several layouts, and they live in one file: the browser and the shell
   * have different keys taken away, which means different chords too.
   */
  where?: KeyScope[];
}

export interface Keymap {
  version: number;
  bindings: KeyBinding[];
}

/**
 * Where an edit to a setting goes: into the user's personal file, or into the project
 * one that lies in the repository itself. A value lives in ONE layer: writing it into
 * one means removing it from the other.
 */
export type SettingScope = 'user' | 'project';

/**
 * Our own tip — BY SHAPE rather than by import.
 *
 * It is shown by the widgets plugin, but we must not depend on that plugin: it depends
 * on us (for the types of the layout's language), and an arrow back would close the
 * circle in the order plugins come up in. So a tip arrives as an entry in the `ui.tips`
 * registry key — in exactly the way we hand the widgets "who catches keys" through
 * `ui.captures`. Turn the widgets off and there is no entry, and the icons simply stay
 * without captions.
 */
export interface TipsLike {
  show(target: Element, title: string, keys?: string[]): void;
  hide(): void;
}
