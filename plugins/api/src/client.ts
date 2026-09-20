import { createContext, createElement, type ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import type { Signal } from '@preact/signals';
import { ideOf, setHook, tables } from './host.js';
import type {
  DirEntry,
  DocState,
  DocVersion,
  EntryKind,
  Settings,
  WorkspaceInfo,
  SettingScope,
  SettingValue,
} from '@mosetta/ide-protocol';

/**
 * The client side of the plugin contract.
 *
 * A plugin is a plain class. Its services arrive as the single constructor
 * argument, its lifecycle is marked with an annotation and may be private, so
 * the surface a neighbouring plugin sees consists of exactly the methods their
 * author made public:
 *
 * ```ts
 * import { activate, type Ide } from '@mosetta/ide-api/client';
 *
 * export default class NpmScripts {
 *   constructor(private readonly ide: Ide) {}
 *
 *   @activate() protected start(): void { this.ide.command('scripts.open', …); }
 *
 *   run(id: string): Promise<void> { … }   // ← this is what a neighbour sees
 * }
 * ```
 *
 * There are two halves, `@mosetta/ide-api/client` and `@mosetta/ide-api/server`,
 * because `Ide` differs between them. One name covering both looked shorter
 * right up to the first "which of the two is meant here".
 *
 * The direction of the dependency matters more than the package: the contract
 * is declared HERE and the application signs up to it, so a mismatch is caught
 * by the compiler from both sides rather than by a plugin calling a method that
 * turns out not to exist.
 *
 * Below the line sit `attach`/`hooksOf`/`registriesOf` and friends — the
 * plugin system's own plumbing, which is not handed to plugins.
 */

export interface Size {
  w: number;
  h: number;
}

/**
 * The draggable border between columns.
 *
 * Part of the contract rather than everyone's own business, for the same
 * reason as the shared popups: there is one of it. Pointer capture, restoring
 * the default width on a double click, showing `col-resize` exactly where
 * dragging really happens — all of that is BEHAVIOUR rather than markup, and
 * rewritten from scratch it ends up feeling slightly different. The same
 * resizer also works inside core dialogs.
 */
export interface ResizerProps {
  /** Memory key for the width. */
  id: string;
  /** A left column grows rightwards, a right one leftwards: you always drag away from yourself. */
  side: 'left' | 'right';
  /** `y` makes it a horizontal bar: the block below grows upwards. */
  axis?: 'x' | 'y';
  /** Limits come from OUTSIDE: a column takes them from the window, a dialog from itself. */
  limits: () => { min: number; max: number };
  defaultWidth: number;
}

/**
 * The tree's memory layer over the wire. The shapes are the protocol's own, so
 * a plugin reads the server's answer as it is.
 */
export type { DirEntry, EntryKind } from '@mosetta/ide-protocol';

/**
 * The project tree over the wire: what a directory holds and what changed on
 * the server. The counterpart to `fs` — there is what moves files, here is
 * what looks at them. It reads `tree.list` rather than `fs.list`: the contents
 * come from the server's memory, so expanding a directory never touches disk.
 *
 * The core keeps no MEMORY of the tree: what is expanded and what has already
 * been read is the state of whoever draws it. The core is left with the method
 * name and the layer's event.
 */
export interface TreeWire {
  list(path: string): Promise<DirEntry[]>;
  /** A directory changed on the server — the visible part of the watcher. */
  onChanged(handler: (event: { path: string }) => void): () => void;
}

/**
 * The OS layer over the wire. Paths are protocol keys, relative to the root;
 * escaping the root is the server's check.
 *
 * Here is exactly what moves files around: create, rename, copy, remove,
 * write. Reading contents through this is not possible, and that is not an
 * oversight — memory reads (`openDoc`), because text is taken from wherever it
 * is freshest.
 */
export interface FsAccess {
  create(path: string, kind: EntryKind): Promise<DirEntry>;
  move(from: string, to: string): Promise<DirEntry>;
  copy(from: string, to: string): Promise<DirEntry>;
  remove(path: string): Promise<void>;
  write(path: string, text: string): Promise<void>;
  writeBytes(path: string, base64: string): Promise<DirEntry>;
  /**
   * A file's bytes, PAST memory: an image does not live in memory, yet
   * sometimes has to be shown. `truncated` means the file is over the ceiling
   * and what arrived is its head, not the file.
   */
  bytes(path: string, limit?: number): Promise<{ path: string; base64: string; bytes: number; truncated: boolean }>;
  /** The absolute path on disk — for the clipboard, not for reading. */
  absolute(path: string): Promise<string>;
}

/**
 * The memory layer over the wire: DOCUMENTS. A counterpart to `tree` and `fs`
 * — protocol method names and layer events, and nothing beyond. What is open,
 * what was edited and what drifted from disk is remembered by the document
 * plugin, not by the core.
 */
export interface DocWire {
  open(path: string): Promise<DocState>;
  close(path: string): Promise<void>;
  edit(path: string, text: string, baseVersion: number): Promise<DocVersion>;
  /**
   * Refuses if disk has moved ahead: an error carrying the protocol's `code`
   * (`RpcErrorCode.RevisionConflict`), not silence.
   */
  save(path: string): Promise<DocState>;
  reload(path: string): Promise<DocState>;
  /** The state held in memory, without counting as an open. */
  state(path: string): Promise<DocState>;
  /**
   * Paths whose memory has drifted from disk. The open document cannot answer
   * this: a dirty one lives on in memory after the tab has closed it.
   */
  unsaved(): Promise<string[]>;
  onChanged(handler: (event: DocVersion) => void): () => void;
  onExternal(handler: (event: { path: string; revision: string }) => void): () => void;
  onDiverged(handler: (event: { path: string; reason: 'changed' | 'removed' }) => void): () => void;
  onMoved(handler: (event: { from: string; path: string }) => void): () => void;
  onRemoved(handler: (event: { path: string }) => void): () => void;
}

/**
 * Workspaces: what is open on the server, what this tab has, and how to change
 * it. Opening a project is the core's job — reset everything project-scoped,
 * attach the socket, remember it in the address. The window you pick one in is
 * a plugin.
 */
export interface WorkspacesAccess {
  /**
   * Which project the tab has. Set BEFORE attaching, and it survives the socket
   * dropping — unlike `project`, which goes out with it. This is the one a
   * project picker needs: "no project" and "the socket blinked" are different
   * things, and one does not open a second window over someone's work for the
   * latter.
   */
  readonly current: { readonly value: WorkspaceInfo | null };
  /** Alive on the server — held by other tabs, or by the idle timeout. */
  readonly live: { readonly value: WorkspaceInfo[] };
  /** The core reports a failure to open by itself; the promise does not reject. */
  open(root: string): Promise<void>;
  /** To one already alive — without rebuilding the index or the language server. */
  switchTo(id: string): Promise<void>;
}

export type NoteKind = 'info' | 'error' | 'work';
export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
  at: number;
}

/**
 * The core's voice: what it has said to the human. The notifications plugin
 * shows and dismisses them; `say`/`complain`/`working` on `Ide` write here. The
 * core keeps no timers — how long to hold a note is up to whoever shows it.
 */
export interface NotesAccess {
  readonly all: { readonly value: Note[] };
  notify(text: string, kind?: NoteKind): number;
  settle(id: number, text: string, kind?: NoteKind): number;
  dismiss(id: number): void;
  dismissAll(): void;
}

/** Where a hunk sits on screen: a popup goes below it or above, never over it. */
export interface HunkBox {
  left: number;
  top: number;
  bottom: number;
}

/**
 * The core services every plugin gets.
 *
 * These are FIELDS of `ide`: a class reads `this.ide.t`, markup uses the
 * `useIde()`/`useT()` hooks. The difference is not cosmetic — a module name is
 * one per tab, whereas a field belongs to an instance, so two IDEs in one tab
 * no longer share one dictionary and one project. The application signs up to
 * this interface, and the compiler catches any drift.
 */
export interface IdeServices {
  /**
   * A label by key. A plugin declares its own dictionary in the manifest's
   * `strings` field, and its keys live in the shared dictionary alongside ours
   * — which means the user's file overrides them the same way.
   */
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  /** Run a command by id — exactly what a key does. */
  readonly runCommand: (id: string) => boolean;
  /**
   * Every command in this build: ids and descriptions from the manifests.
   *
   * The set of commands is open — it is known to the plugins that came up, not
   * to the protocol. This is where the keymap editor takes it from: offering a
   * human a key bound to a command that does not exist is not on.
   */
  readonly knownCommands: { readonly value: ReadonlyArray<{ id: string }> };
  /**
   * All settings, as they arrived from the server: core sections typed, plugin
   * sections `unknown`. A plugin reads its own section through `settingsOf`,
   * with the defaults it declared itself.
   */
  readonly settings: { readonly value: Settings | null };
  /**
   * Your own section layered over your own defaults. Until settings arrive, the
   * defaults; a key of the wrong type falls back to its default; an unknown key
   * is left alone. Read as a signal, so inside `effect` and `computed` the
   * redraw happens by itself.
   */
  readonly settingsOf: <T extends object>(section: string, defaults: T) => { readonly value: T };
  /**
   * The project this tab is ATTACHED to; `null` for none.
   *
   * A signal rather than an event: a plugin usually needs "which project is it
   * now" rather than "the project changed", and the second cannot express the
   * first without a store of its own. Switching projects is a change of
   * `value`, and `effect` will see it.
   *
   * Attached specifically, not "the one the tab remembers": between the
   * connection dropping and re-attaching, the server answers a plugin's
   * questions with "the session is not attached". In that window the signal is
   * `null`, and there is nobody to ask.
   */
  readonly project: { readonly value: WorkspaceInfo | null };
  readonly tree: TreeWire;
  readonly fs: FsAccess;
  readonly docs: DocWire;
  /** Write a setting: it ends up in a settings file. */
  readonly setSetting: (
    section: string,
    key: string,
    value: SettingValue,
    /** Where to write: to yourself, or into the project. Defaults to yourself. */
    scope?: SettingScope,
  ) => Promise<void>;
  readonly workspaces: WorkspacesAccess;

  /** Whether the socket to the server is alive. The toolbar shows it, the core knows it. */
  readonly connected: { readonly value: boolean };
  /**
   * What the daemon reported about itself on the last heartbeat: what it holds
   * itself (`rssMb`) and what its children hold — language servers, terminals,
   * git (`kidsMb`, `null` when the system cannot be measured).
   *
   * It sits here, next to `connected`, for the same reason: the core knows it,
   * the toolbar shows it. `null` means "not asked yet", not "zero".
   */
  readonly daemon: { readonly value: { rssMb: number; kidsMb: number | null } | null };
  readonly notes: NotesAccess;
  /**
   * Where the project's settings file lives; `null` when no project is open and
   * there is nowhere to write project-scoped settings.
   *
   * File contents are deliberately absent: what they say is visible in the
   * section's registry key, as a layer entry with its author attached.
   */
  readonly projectPath: { readonly value: string | null };
  /** Reset a setting to factory: the key leaves the settings files. */
  readonly resetSetting: (section: string, key: string) => Promise<void>;
  /** Where the IDE is mounted: size, edges, events. */
  readonly mount: Mount;
}

/** A rectangle in viewport coordinates, as `getBoundingClientRect` gives it. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where the IDE is mounted.
 *
 * Everything that used to measure `window` and listen to it asks here instead:
 * an IDE mounts into any element, not only into a whole page. Coordinates in
 * the plugin API are the viewport's, as the DOM hands them over (`clientX`,
 * `getBoundingClientRect`); translating into root coordinates is done by
 * whoever writes `left`/`top`, through `local`.
 */
export interface Mount {
  /** The root's size; recomputed by itself when the root changes. */
  readonly size: { readonly value: { w: number; h: number } };
  /** The root's edges in the viewport: pin a menu to the IDE's edge, not the window's. */
  bounds(): Bounds;
  /** A viewport point to a point inside the root: for an overlay's `left`/`top`. */
  local(x: number, y: number): { x: number; y: number };
  /** Focus is "nowhere": on the page body, or on the root itself. */
  idle(el: Element | null): boolean;
  /**
   * Listen for the IDE's keys and mouse. A whole page means the browser window;
   * an embedded IDE means its own root — the host page's events are not its
   * business.
   */
  listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: { capture?: boolean },
  ): () => void;
  /** The tab's name. An embedded IDE leaves the host page's title alone. */
  title(text: string): void;
}

const IdeContext = createContext<IdeServices | null>(null);

/** Hand the services to the markup below: the app root, or your own separate root. */
export function IdeProvider(props: { value: IdeServices; children?: ComponentChildren }) {
  return createElement(IdeContext.Provider, { value: props.value }, props.children);
}

/** The core services, from markup. Without an `IdeProvider` above: a loud refusal, not `undefined`. */
export function useIde(): IdeServices {
  const ide = useContext(IdeContext);
  if (!ide) throw new Error('the IDE services were not found: the markup root is not wrapped in IdeProvider');
  return ide;
}

/** A label by key, from markup — the most frequent one, so it gets its own name. */
export function useT(): IdeServices['t'] {
  return useIde().t;
}

export interface PluginToolbarEntry {
  id: string;
  /** A dictionary key for the tooltip, not a ready-made string. */
  title: string;
  /**
   * The button's icon: the name of one of ours, or a drawing of your own.
   *
   * Your own is not about looks. `npm` is someone else's mark, and it used to
   * sit in the core's icon set, i.e. the core carried a picture around for the
   * sake of one plugin. A plugin that cannot bring its own icon forces the core
   * to know about it.
   *
   * The argument says whether the feature is open: an icon has two states,
   * outlined and filled, and that is part of the toolbar rule rather than
   * decoration.
   */
  icon: string | ((filled: boolean) => unknown);
  command: string;
  /** The "panel is open" signal: the button is painted from it. */
  active?: { readonly value: boolean };
}

/** Everything the IDE can do for a plugin. Arrives as the single argument. */
export interface Ide extends IdeServices {
  /** The package name, which is also the plugin id. */
  readonly name: string;
  /** Calling YOUR OWN server half. Someone else's is called through `getPlugin`. */
  readonly rpc: { call(method: string, params?: unknown): Promise<unknown> };
  /**
   * Another plugin, by its class. The key and the type are the same object, so
   * no cast is needed and a typo is caught by the compiler.
   */
  getPlugin<T>(ctor: PluginClass<T>): T;
  /**
   * Declare a command. There is deliberately no title here: the human-readable
   * one lives in the dictionary under `command.<id>`, and the description for
   * developers in the package manifest. A third copy would have to agree with
   * both.
   */
  command(id: string, run: () => void): void;
  /**
   * A key in the shared registry. Anything may be written to any key, even one
   * whose schema nobody declared: there may be no reader at all.
   */
  registry<T>(key: string): RegistryHandle<T>;
  /**
   * Remember a value across tab reloads.
   *
   * The core does NOT know what the value is. Whether a panel is open, which
   * tab was selected, whether a section is collapsed — its only job is to
   * remember. Keys are partitioned per plugin: two plugins are entitled to name
   * their state alike, and they must not silently share one cell.
   *
   * This lives in the tab's memory and in the machine's memory: every tab has
   * its own layout, and a new one grows out of the last one on this machine.
   * `scope: 'tab'` means the tab only — what makes sense here and now (which
   * file is open) is not inherited by a new tab.
   */
  remember<T>(key: string, initial: T, scope?: 'tab' | 'both'): Signal<T>;
  /**
   * Your own styles. A plugin that draws a panel has to be able to dress it:
   * otherwise its CSS would have to live in the core's stylesheet, which is the
   * very leak that carrying someone else's icon was.
   */
  css(text: string): void;
  /**
   * Listen for YOUR OWN events from your own server half.
   *
   * The core carries them in an envelope and does not look inside: the event's
   * name is the plugin's business, as is its payload. Names are partitioned per
   * plugin, so subscribing to `data` hears only your own.
   *
   * Returns an unsubscribe. Unsubscribing is mandatory wherever a component
   * sets the subscription up: a closed panel with a live handler is not only a
   * memory leak, it is calls into dead markup.
   */
  on(event: string, handler: (payload: unknown) => void): () => void;

  surface(view: () => unknown): void;
  say(message: string): void;
  /**
   * Complain: the same place, but in red.
   *
   * Its own name rather than a flag: "said" and "complained" are different
   * intentions, and a plugin with only `say` starts gluing "Error: …" into the
   * text. At which point the note's colour stops meaning anything.
   */
  complain(message: string): void;
  /**
   * One line per slot: the next message for the same slot REPLACES the previous
   * one instead of piling on top. Otherwise missed keystrokes would build a wall
   * of ten identical messages.
   */
  sayOnce(slot: string, message: string): void;
  /**
   * Work has started: you get back the thing that ends it.
   *
   * A push goes over the network and takes seconds. Showing a frozen interface
   * meanwhile is a lie that nothing is happening; showing a note and forgetting
   * it leaves "pushing" up forever. Hence a pair: `working` opens the note, the
   * returned function closes it — with success or with failure.
   */
  working(text: string): (done: string, failed?: boolean) => void;
}

/** A plugin as a value: a constructor that takes the services. */
export type PluginClass<T = unknown> = new (ide: Ide) => T;

/**
 * A registry key and the shape of what it holds.
 *
 * Declared by a CLASS DECORATOR rather than by a call in `activate`, and that
 * is not sugar. A class's metadata is available to the host right after the
 * module is imported — that is, BEFORE anyone has activated. So the host loads
 * in two passes: first it collects every declaration, then it activates. Load
 * order stops mattering, and one can write into a key without taking a hard
 * dependency on whoever reads it.
 *
 * The schema is ordinary JSON Schema, i.e. DATA. That is what makes it possible
 * to show it in a window, keep it next to the settings file, and validate what
 * a human wrote by hand against it. Fields holding non-JSON (a signal, a render
 * function) are declared with the empty schema `{}`: they do not serialise, and
 * a key with such fields has no business being persistent.
 */
export interface RegistrySpec {
  key: string;
  /** JSON Schema for one entry. */
  schema?: object;
  /**
   * Where the entries live. `memory` means in this tab, not surviving a reload;
   * further levels will appear when we get to them.
   */
  persist?: 'memory';
}

/** A key's handle: anyone may write, whoever needs it reads. */
export interface RegistryHandle<T> {
  /** Add your entry. It is withdrawn together with the plugin. */
  add(value: T): () => void;
  /** Everything the key holds: a signal, so a reader redraws by itself. */
  readonly all: { readonly value: T[] };
  /**
   * The same, but WITH AUTHORS. Needed wherever "who wrote this" is part of the
   * meaning: for settings the author of an entry is the LAYER (factory, mine,
   * the project's), and the editor reads layers from here.
   */
  readonly entries: { readonly value: Array<{ by: string; value: T }> };
}

/**
 * Declare a registry key. Goes on the plugin CLASS:
 *
 * ```ts
 * @registry({ key: 'toolbar.button', schema: BUTTON })
 * export default class Toolbar { … }
 * ```
 *
 * The table is keyed by the CLASS ITSELF rather than by its name: two plugins
 * are entitled to name a class alike.
 */
export function registry(spec: RegistrySpec) {
  return function (target: object, ctx: ClassDecoratorContext): void {
    void ctx;
    const list = tables.declared.get(target) ?? [];
    list.push(spec);
    tables.declared.set(target, list);
  };
}

/** A hint about a settings field for the editor. */
export interface SettingField {
  /** The possible values: in the editor the field becomes a choice among them. */
  options?: readonly string[];
}

/**
 * A settings section a plugin declares as its own.
 *
 * Defaults are the plugin's code, differences are the human's file. The
 * declaration goes into the `settings` registry key, which the core declares:
 * `setSetting` uses it to check that the section and key exist and that the
 * type matches, and the settings screen learns from it what may be edited.
 */
export interface SettingsSection {
  section: string;
  /** The section's defaults — the same ones the plugin reads it with. */
  defaults: object;
  /**
   * What is known about the fields beyond the type of their default. The editor
   * infers the type from the default itself; here goes what cannot be inferred.
   */
  fields?: Record<string, SettingField>;
  /**
   * Your own editor for the section: the settings window draws this instead of
   * generated rows.
   *
   * Needed wherever a "key — field" row explains nothing: a keymap is a list of
   * chords with surfaces and environments, and editing it through a text field
   * is mockery. It travels as the entry's VALUE in the key, exactly as toolbar
   * icons already do, so it does not touch the package border.
   */
  editor?: () => unknown;
  /**
   * The shape of the section's VALUE, as JSON Schema.
   *
   * Not to be confused with the schema of an ENTRY in the `settings` key: that
   * one describes the declaration itself (`section`, `defaults`, `owner`,
   * `title`) and belongs to the core. This one describes what a human writes
   * into a file, and belongs to whoever declared the section.
   *
   * It validates three things: a write through `setSetting`, the CONTENTS OF
   * THE FILE (hand edits, and the project file arriving from git) and — one day
   * — which widget to draw. A key of the wrong shape is thrown out with a
   * complaint naming it, and the section keeps working on the rest.
   */
  schema?: object;
}

/**
 * The registry key holding a section's LAYERS.
 *
 * A plugin declares it (through `configSection`), and the schema is the shape
 * of the section's value. It holds as many entries as there are places the
 * section arrived from, and an entry's AUTHOR is precisely its layer.
 */
export function settingsKey(section: string): string {
  return `settings.${section}`;
}

/**
 * Who wrote a layer — which is also the file's name, so that the registry's
 * complaint reads by itself: "`.mosetta/settings.json` writes an entry of the
 * wrong shape into «settings.lsp»: /startOnOpen must be boolean". The factory
 * layer is signed with the name of the package that declared the section.
 */
export const USER_LAYER = 'settings.json';
export const PROJECT_LAYER = '.mosetta/settings.json';

/**
 * A section's layers in the order they apply: factory, mine, the project's.
 *
 * The order of entries in a key is the order they were put there, and that is a
 * race: the config arrives from the server, the section is declared by a
 * plugin, and either may win. Once that cost a full day of bewilderment — a key
 * I had removed in my file stayed removed there and stayed alive in the list,
 * because the factory layer landed AFTER mine and covered the removal.
 *
 * So the stack is not read "as it lies" but ordered by AUTHOR: the author is
 * the layer.
 */
export function inLayerOrder<T>(entries: ReadonlyArray<{ by: string; value: T }>): Array<{ by: string; value: T }> {
  const rank = (by: string): number => (by === USER_LAYER ? 1 : by === PROJECT_LAYER ? 2 : 0);
  return [...entries].sort((a, b) => rank(a.by) - rank(b.by));
}

/**
 * Goes on the plugin CLASS, next to `@registry`:
 *
 * ```ts
 * @configSection({ section: 'terminal', defaults: TERMINAL_DEFAULTS })
 * export default class TerminalPlugin { … }
 * ```
 */
export function configSection(spec: SettingsSection) {
  return function (target: object, ctx: ClassDecoratorContext): void {
    void ctx;
    const list = tables.sections.get(target) ?? [];
    list.push(spec);
    tables.sections.set(target, list);
  };
}

/**
 * An entry in the `settings` key: a section's declaration and whose it is. The
 * host writes it on the plugin's behalf — a plugin does not name its own owner.
 */
export interface SettingsEntry extends SettingsSection {
  /** The owner's package name (`@mosetta/ide-plugin-git`), or `core`. */
  owner: string;
  /** A human-readable name for the owner — a dictionary key. */
  title: string;
}

/** A plugin's passport. */
export interface PluginSpec {
  /**
   * What the plugin is called for a human: a dictionary key, not a ready-made
   * string. A plugin always has a package name; this is the second name, the one
   * seen in the settings editor and in the plugin list.
   */
  title: string;
  /**
   * DEFAULT labels, right here: key → English text.
   *
   * For a plugin to which a dictionary file is needless ceremony: three keys sit
   * closer to the code than to a separate JSON file. They land BELOW the file
   * from the manifest (`ide.strings`), so the file overrides them, and a
   * translation overrides both.
   *
   * English only. Any other language means a locale file: a language taken from
   * code can neither be translated nor overridden.
   */
  strings?: Record<string, string>;
}

/**
 * A passport is REQUIRED of a plugin class:
 *
 * ```ts
 * @plugin({ title: 'plugin.git' })
 * export default class GitPlugin { … }
 * ```
 *
 * Without one the host complains out loud, and the distribution test refuses to
 * pass a bundled plugin.
 */
export function plugin(spec: PluginSpec) {
  return function (target: object, ctx: ClassDecoratorContext): void {
    void ctx;
    tables.passports.set(target, spec);
  };
}

/**
 * The method called when the plugin comes up.
 *
 * An annotation rather than the name `activate` in a base class. The difference
 * is that a marked method may be CLOSED: the lifecycle belongs to the host, a
 * neighbouring plugin has no interest in it and it should not stick out in
 * their view. It also removes a whole class of typos — without a base class,
 * `activte` would simply never be called, whereas a method marked `@activate()`
 * is called under any name.
 *
 * Close such methods with `protected` rather than `private`. From the outside
 * there is no difference — both are hidden from a neighbour — but a `private`
 * method called only by a decorator is considered unread by TypeScript, which
 * under `noUnusedLocals` demands its removal. The decorator does read it; the
 * compiler just does not count that.
 *
 * The hooks are stored OUTSIDE the instance: a property appended to someone
 * else's object shows up in its type, in `Object.keys` and in the debugger,
 * whereas the whole point is that a plugin's surface consists only of what its
 * author made public.
 */
export function activate() {
  return function (method: () => unknown, ctx: ClassMethodDecoratorContext): void {
    void ctx;
    ctx.addInitializer(function (this: unknown) {
      const target = this as object;
      setHook(target, method.bind(target));
    });
  };
}

/**
 * A method called AS A COMMAND.
 *
 * ```ts
 * @command('find.next')
 * protected next(): void { this.find.next(); }
 * ```
 *
 * The id and nothing else. What the command is called for a human is not
 * written here and cannot be: labels are DATA, and they live in the same
 * plugin's dictionary under `command.<id>`. The key is not passed as a second
 * argument but derived by a RULE — a passed key would be a second place obliged
 * to agree with the first.
 *
 * `protected` rather than `private` for the same reason as `@activate`.
 */
export function command(id: string) {
  return function (method: () => unknown, ctx: ClassMethodDecoratorContext): void {
    void ctx;
    ctx.addInitializer(function (this: unknown) {
      const target = this as object;
      const list = tables.declaredCommands.get(target) ?? [];
      list.push({ id, run: method.bind(target) as () => unknown });
      tables.declaredCommands.set(target, list);
    });
  };
}

/** A command declared by annotation: its id and its call. The label is in the dictionary. */
export interface DeclaredCommand {
  id: string;
  run: () => unknown;
}

/**
 * A method that actually goes to the server.
 *
 * Such a method's body is a stub: it exists only to declare the signature, and
 * the plugin system replaces the method whole. Data came back — it comes back
 * from the call; the server refused — the call throws, like any other `await`.
 *
 * The name defaults to the method's own. Wiring "list" to "list" by hand would
 * mean two places obliged to agree, and one day they will not, and nobody will
 * look here.
 */
export function remote(name?: string) {
  return function <This extends object, Args extends unknown[], R>(
    method: (this: This, ...args: Args) => R,
    ctx: ClassMethodDecoratorContext,
  ): (this: This, ...args: Args) => R {
    void method;
    return function (this: This, ...args: Args): R {
      return ideOf(this).rpc.call(name ?? String(ctx.name), args[0]) as R;
    };
  };
}

/**
 * The stub body of a remote method.
 *
 * Not `return [] as never` and not `undefined`: if the decorator failed to
 * apply for any reason, the method has to SHOUT rather than quietly return
 * plausible emptiness. A silent stub is half a day of debugging.
 */
export function stub(): never {
  throw new Error('the method was not substituted: a forgotten @remote decorator?');
}

export * from './host.js';
