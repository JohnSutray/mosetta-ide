import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { LanguageSupport } from '@codemirror/language';
import type { MethodNames } from './method-names.js';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';

/**
 * Highlighting by extension.
 *
 * For now this is Lezer: incremental parsing inside CodeMirror itself, with no call
 * outwards — typing waits for no process.
 *
 * A class, because the list of languages will one day stop being a switch: the
 * extensions will arrive from the settings and the grammars from plugins. Then the
 * filling changes rather than the callers.
 */
export class Languages {
  constructor(private readonly methodNames: MethodNames) {}

  /**
   * The JS family also carries a mark for method names: the grammar does not tell them
   * from fields, whereas IDEA does. What remains is a `LanguageSupport` rather than a
   * list: painting a line takes its parser from it.
   */
  private js(support: LanguageSupport): LanguageSupport {
    return new LanguageSupport(support.language, [support.support, this.methodNames.extension]);
  }

  /** What to highlight this file with. An unfamiliar extension means plain text. */
  of(path: string): Extension {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    switch (ext) {
      case 'ts':
        return this.js(javascript({ typescript: true }));
      case 'tsx':
        return this.js(javascript({ typescript: true, jsx: true }));
      case 'js':
      case 'mjs':
      case 'cjs':
        return this.js(javascript());
      case 'jsx':
        return this.js(javascript({ jsx: true }));
      case 'json':
      case 'jsonc':
        return json();
      case 'css':
      case 'scss':
        return css();
      case 'html':
      case 'htm':
      case 'vue':
        return html();
      case 'md':
      case 'markdown':
        return markdown();
      default:
        return [];
    }
  }
}
