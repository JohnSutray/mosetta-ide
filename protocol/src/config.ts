/**
 * Settings are data, not code. Two files hold them: the user's own, in the
 * IDE config directory, and the project's own, at `<root>/.mosetta/settings.json`.
 * Defaults live in code, and the server is the single source of truth — the
 * client keeps no copy of its own.
 */

export interface FsSettings {
  /** Never shown at all. */
  hidden: string[];
  /**
   * Shown in the tree, but never walked eagerly and never indexed.
   * node_modules expands on click and enters memory lazily.
   */
  noScan: string[];
  /** Files larger than this are not read whole. */
  maxFileMb: number;
  /** How much source to pull into memory when a project opens. */
  preloadBudgetMb: number;
  /**
   * Whether to watch disk and pull changes into memory. Worth turning off on a
   * network share, where watching lies or costs too much: the editor keeps
   * working, the tree just stops refreshing on its own.
   */
  watch: boolean;
  /** Pause before parsing a batch of events: editors write in several goes. */
  watchDebounceMs: number;
}

/**
 * Shape of the `fs` section's value — the only core section edited through the
 * settings window. It lives next to the type: the type says what is here, the
 * schema says how to validate what a human wrote.
 */
export const FS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hidden: { type: 'array', items: { type: 'string' } },
    noScan: { type: 'array', items: { type: 'string' } },
    maxFileMb: { type: 'number' },
    preloadBudgetMb: { type: 'number' },
    watch: { type: 'boolean' },
    watchDebounceMs: { type: 'number' },
  },
} as const;

/**
 * Interface language — a core section, because the dictionary belongs to the
 * core.
 *
 * English is not one language among others: it is the base, it is what the
 * repository is written in, and it has to be complete. The chosen language is
 * layered on top and is allowed to have holes; whatever it lacks shows through
 * in English.
 */
export interface UiSettings {
  locale: string;
}

export const UI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { locale: { type: 'string' } },
} as const;

/** Plugins: a plain list of package names. */
export interface PluginSettings {
  enabled: string[];
}

/**
 * What a single setting may hold.
 *
 * Scalars first, then lists of strings (search masks), now any JSON: a keymap
 * is an array of objects, and without that it could not be written from the
 * settings window at all. Patching the file in place handles exactly as much:
 * the value is found by key and replaced whole, by counting brackets.
 */
export type SettingValue =
  | string
  | number
  | boolean
  | SettingValue[]
  | { [key: string]: SettingValue };

/**
 * All settings. Only the CORE sections are typed: the plugin set, the
 * filesystem and the interface language. Every other section belongs to a
 * plugin, which declares it (`@configSection`) and reads it with defaults of
 * its own. The core carries those sections without knowing their shape.
 */
export interface Settings {
  plugins: PluginSettings;
  fs: FsSettings;
  ui: UiSettings;
  [section: string]: unknown;
}

/**
 * Where a setting is written: into the user's own file, or into the project
 * file that lives in the repository. A value lives in exactly ONE layer —
 * writing it to one removes it from the other.
 */
export type SettingScope = 'user' | 'project';

export interface ConfigBundle {
  settings: Settings;
  /** Where it was read from — visible in the log panel when something is off. */
  sources: string[];
  /**
   * What `settings.json` actually says, without defaults. This is how the
   * settings editor tells a value of yours from a factory one.
   */
  user: Record<string, Record<string, unknown>>;
  /** Defaults of the core sections; plugins hold their own. */
  defaults: Settings;
  /**
   * What the project's `.mosetta/settings.json` says — without defaults, like
   * `user`. Empty when there is no project, or no file.
   */
  project: Record<string, Record<string, unknown>>;
  /** Where the project file lives; `null` when no project is open. */
  projectFile: string | null;
}
