/**
 * The plugin contract.
 *
 * A plugin ships as TypeScript SOURCE and is built on the human's machine. The
 * reason is not purity: only building it here makes it possible to reliably
 * substitute the shared singletons. With prebuilt bundles one has to HOPE the
 * author marked their externals correctly, and a single mistake yields two
 * copies of Preact (hooks break) or two copies of `@codemirror/state`, which
 * CodeMirror 6 refuses outright — it compares class identity.
 *
 * Building here also buys something unobtainable otherwise: a plugin writes
 * ordinary `import` statements instead of taking everything as parameters.
 */

export interface PluginManifest {
  /** The package name, which is also the plugin id. */
  name: string;
  version: string;
  /**
   * Entry points. Both are optional — a plugin can be server-only (an indexer)
   * or client-only (a theme).
   */
  client?: string;
  server?: string;
  /** Command ids and their descriptions, surfaced as `PluginInfo.commands`. */
  commands?: Record<string, string>;
  /**
   * The plugin's dictionaries. Labels are data, and a plugin is no exception:
   * its code holds keys, its strings sit in JSON and join the shared dictionary
   * alongside ours.
   *
   * A string names one file, and that file is the DEFAULT language, i.e.
   * English. A map names one file per language (`{ en: 'src/en.json', ru:
   * 'src/ru.json' }`); `en` is required, since it is the fallback layer for
   * everything another language does not have yet.
   */
  strings?: string | Record<string, string>;
}

/** What became of a plugin on this machine. */
export type PluginState = 'ok' | 'building' | 'failed';

export interface PluginInfo {
  name: string;
  version: string;
  state: PluginState;
  /** Whether it has a client half; the client is fetched separately. */
  hasClient: boolean;
  hasServer: boolean;
  commands: Record<string, string>;
  /** Which plugins it depends on, derived from its imports. */
  needs: string[];
  /**
   * The plugin's dictionaries, already read, by language. The client merges
   * `en` into the base and layers the chosen language over it. All of them
   * travel at once: a plugin dictionary is a few dozen strings, and switching
   * language should not have to ask the server.
   */
  strings: Record<string, Record<string, string>>;
  /**
   * Why it did not work out. A silent failure is the worst kind: a plugin that
   * simply never appeared gets looked for anywhere except the build log.
   */
  error?: string;
}
