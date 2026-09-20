import * as preact from 'preact';
import * as hooks from 'preact/hooks';
import * as jsxRuntime from 'preact/jsx-runtime';
import * as signals from '@preact/signals';
import * as cmState from '@codemirror/state';
import * as cmView from '@codemirror/view';
import * as cmCommands from '@codemirror/commands';
import * as cmLanguage from '@codemirror/language';
import * as cmSearch from '@codemirror/search';
import * as lezerHighlight from '@lezer/highlight';
import * as langJavascript from '@codemirror/lang-javascript';
import * as langJson from '@codemirror/lang-json';
import * as langCss from '@codemirror/lang-css';
import * as langHtml from '@codemirror/lang-html';
import * as langMarkdown from '@codemirror/lang-markdown';

/**
 * What the client puts on the shared table from its side.
 *
 * Literal `import * as` rather than a loop: vite has to see the names at build time.
 * That makes this the one list with something to drift from — `CORE_PROVIDED` on the
 * server says what the plugin build makes stubs for — and a test holds the two equal.
 * The contract (`@mosetta/ide-api/client`) is placed separately: it is assembled from
 * the application's surface.
 *
 * Every line is here for one reason: a second copy is not "slightly worse" but broken —
 * preact's hooks and CodeMirror's state classes compare identity, and popups share one
 * "there is one window on screen" registry.
 */
export const sharedModules: Record<string, unknown> = {
  preact,
  'preact/hooks': hooks,
  'preact/jsx-runtime': jsxRuntime,
  '@preact/signals': signals,
  '@codemirror/state': cmState,
  '@codemirror/view': cmView,
  '@codemirror/commands': cmCommands,
  '@codemirror/language': cmLanguage,
  '@codemirror/search': cmSearch,
  '@lezer/highlight': lezerHighlight,
  '@codemirror/lang-javascript': langJavascript,
  '@codemirror/lang-json': langJson,
  '@codemirror/lang-css': langCss,
  '@codemirror/lang-html': langHtml,
  '@codemirror/lang-markdown': langMarkdown,
};
