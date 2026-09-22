/** The `lsp` section of the settings file is ours. */
export interface LspServerSettings {
  enabled: boolean;
  /**
   * What to launch. EMPTY means the one that came with the editor: just as an empty
   * `terminal.shell` means "as the system decides". A command the user named is taken
   * verbatim.
   */
  command: string;
  args: string[];
  /** Which extensions this server looks after. */
  extensions: string[];
  /** What to check with the project sweep; by default, files with types. */
  checkExtensions?: string[];
  /**
   * The server's own settings — for tsserver those are its `preferences`: the quotes
   * and the path ending in auto-imports, and the rest.
   *
   * Project values arrive HERE TOO: a project puts its own into
   * `.mosetta/settings.json`, and the settings layer has already merged them. A plugin
   * does not need to know which file they came from — and it no longer knows.
   */
  preferences?: Record<string, unknown>;
}

export interface LspSettings {
  /** Start when the project opens rather than on the first file (requirement five). */
  startOnOpen: boolean;
  checkProject: boolean;
  /**
   * The sweep's ceiling is MEMORY rather than a count of files.
   *
   * The count was a proxy with an unknown multiplier: on this repository a sweep costs
   * 1.35 MB per file, on a repository of short constants a few kilobytes. One and the
   * same "2000" meant 2.7 GB in one place and a hundred megabytes in another. We
   * measure what we fear rather than what is easy to count.
   *
   * The default is 3 GB, like VS Code's `typescript.tsserver.maxTsServerMemory`: a
   * number that has been run in, and one people recognise.
   *
   * The first value was 1536 — from a measured peak of 1.27 GB. It missed by exactly
   * the mistake this was all started for: 1.27 GB was held by ONE process, while the
   * budget counts the TREE, where two more stand beside it. On a live check the sweep
   * stopped at 220 files out of 425.
   */
  memoryBudgetMb: number;
  /** Whether to show in the toolbar how much was swept and what it cost. */
  sweepIndicator: boolean;
  servers: Record<string, LspServerSettings>;
}

/**
 * The factory set of servers — with TypeScript in it.
 *
 * This used to be empty, and that meant exactly one thing: a freshly installed IDE had
 * no type checking at all, while the line about typescript lived only in a PERSONAL
 * settings file — one that a new user does not have. "The TS server starts when the
 * project opens" held on one machine out of all of them.
 *
 * Putting a server here was only possible along with the server itself: a default
 * running into somebody else's global installation is a red badge out of nowhere in the
 * first minute of work. So `typescript-language-server` is now a dependency of the
 * plugin, and an empty `command` means "ours".
 */
export const LSP_DEFAULTS: LspSettings = {
  startOnOpen: true,
  checkProject: true,
  memoryBudgetMb: 3072,
  sweepIndicator: true,
  servers: {
    typescript: {
      enabled: true,
      command: '',
      args: ['--stdio'],
      extensions: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'],
    },
  },
};

/**
 * The shape of the section's value.
 *
 * `preferences` is deliberately OPEN: those are somebody else's program's settings
 * (tsserver and its kin), and their list is known to it rather than to us. Everything
 * else is ours, and closed: a typo in a key's name has to be named out loud rather than
 * silently doing nothing.
 */
export const LSP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    startOnOpen: { type: 'boolean' },
    checkProject: { type: 'boolean' },
    memoryBudgetMb: { type: 'number' },
    sweepIndicator: { type: 'boolean' },
    servers: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          command: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
          extensions: { type: 'array', items: { type: 'string' } },
          checkExtensions: { type: 'array', items: { type: 'string' } },
          preferences: { type: 'object' },
        },
      },
    },
  },
} as const;
