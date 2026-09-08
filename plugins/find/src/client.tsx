import { activate, type Ide } from '@ide/api/client';
import { search } from '@codemirror/search';
import { ViewPlugin } from '@codemirror/view';
import { render } from 'preact';
import { FindState } from './find.js';
import { FindBar } from './find-bar.js';
import { STYLE } from './style.js';

export default class FindPlugin {
  readonly find = new FindState();

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry('editor.extension').add({ id: 'find', extension: this.extension() });

    const find = this.find;
    this.ide.command('find.open', () => find.open('find'));
    this.ide.command('find.replace', () => find.open('replace'));
    this.ide.command('find.next', () => find.next());
    this.ide.command('find.prev', () => find.prev());
    this.ide.command('find.close', () => find.close());
    this.ide.command('find.newline', () => find.newline());
    this.ide.command('find.toggleCase', () => find.toggleCase());
    this.ide.command('find.toggleWords', () => find.toggleWords());
    this.ide.command('find.toggleRegex', () => find.toggleRegex());
    this.ide.command('find.replaceOne', () => find.replaceOne());
    this.ide.command('find.replaceAll', () => find.replaceEverything());
  }

  private extension() {
    const find = this.find;
    return [
      search({
        top: true,
        createPanel: () => {
          const dom = document.createElement('div');
          dom.className = 'find-host';
          render(<FindBar find={find} />, dom);
          return { dom, top: true, destroy: () => render(null, dom) };
        },
      }),
      ViewPlugin.define((view) => {
        find.attach(view);
        return {
          update(update) {
            if (update.docChanged) find.recount();
          },
          destroy() {
            find.detach(view);
          },
        };
      }),
    ];
  }
}
