import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { LanguageSupport } from '@codemirror/language';
import { methodNames } from './method-names.js';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';

export class Languages {
  private js(support: LanguageSupport): LanguageSupport {
    return new LanguageSupport(support.language, [support.support, methodNames.extension]);
  }

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

export const languages = new Languages();
