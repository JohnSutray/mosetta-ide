/** The `debug` section in `settings.json` is ours. */
export interface DebugSettings {
  /**
   * The program being debugged has printed an address — open it in the browser UNDER
   * THE DEBUGGER. That is how the bug on `yarn storybook` reaches the code in the
   * browser rather than only the server that hands it out.
   */
  openBrowser: boolean;
  /**
   * What we recognise an address in the output by. A regular expression; the first
   * group is the address itself. The default catches `localhost`, `127.0.0.1` and
   * `0.0.0.0` — that is how Vite, Next, Storybook and this very plugin's `http.Server`
   * write it.
   */
  serverReady: string;
  /**
   * Which browser. EMPTY means the installed Chrome (the adapter finds it itself;
   * `canary`, `dev`, `edge` are its words too); a path to an executable is taken
   * literally.
   */
  browser: string;
  /** Arguments for the browser: `--headless=new` for checks with no window. */
  browserArgs: string[];
  /**
   * Where the server hands files out from, RELATIVE to the project's root: the address
   * `/src/main.ts` on the page is the file `<webRoot>/src/main.ts`. Empty means the
   * root itself, as with Vite and Next; in a monorepo it is `packages/site`.
   */
  webRoot: string;
}

export const DEBUG_DEFAULTS: DebugSettings = {
  openBrowser: true,
  serverReady: `https?://(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)(?::\\d+)?[^\\s"'<>)\\]]*`,
  browser: '',
  browserArgs: [],
  webRoot: '',
};

/** The shape of the section's value: the user's file is checked against it. */
export const DEBUG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    openBrowser: { type: 'boolean' },
    serverReady: { type: 'string' },
    browser: { type: 'string' },
    browserArgs: { type: 'array', items: { type: 'string' } },
    webRoot: { type: 'string' },
  },
} as const;
