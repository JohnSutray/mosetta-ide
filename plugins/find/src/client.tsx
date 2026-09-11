import CodePlugin from '@ide/plugin-code';
import { activate, configSection, IdeProvider, remote, stub, type Ide } from '@ide/api/client';
import { search } from '@codemirror/search';
import { ViewPlugin } from '@codemirror/view';
import { computed } from '@preact/signals';
import { render } from 'preact';
import { FindState } from './find.js';
import { FindBar } from './find-bar.js';
import { FindFiles, type FilesAsk, type FindFilesRemote } from './files.js';
import { FindFilesPopup } from './files-popup.js';
import type { GrepResult } from './grep.js';
import { FIND_DEFAULTS } from './settings.js';
import { STYLE } from './style.js';
import { FindFilesIcon } from './icons.js';
import DocPlugin from '@ide/plugin-doc';
import KeymapPlugin from '@ide/plugin-keymap';

export type { FileHit, GrepResult } from './grep.js';

@configSection({ section: 'find', defaults: FIND_DEFAULTS })
export default class FindPlugin implements FindFilesRemote {
  readonly find = new FindState();
  readonly files: FindFiles;

  constructor(private readonly ide: Ide) {
    this.files = new FindFiles(
      this,
      computed(() => this.ide.settingsOf('find', FIND_DEFAULTS).value.masks),
      computed(() => this.ide.settingsOf('find', FIND_DEFAULTS).value.masksOff),
      (list) => this.ide.setSetting('find', 'masks', list),
      (list) => this.ide.setSetting('find', 'masksOff', list),
      (message) => ide.complain(message),() => ide.getPlugin(DocPlugin)
    );
  }

  grep(ask: FilesAsk): Promise<GrepResult> {
    return this.askGrep(ask);
  }

  replace(ask: FilesAsk & { replacement: string; paths?: string[] }): Promise<{ files: number; replaced: number }> {
    return this.askReplace(ask);
  }

  @remote('grep') protected askGrep(_ask: FilesAsk): Promise<GrepResult> {
    return stub();
  }

  @remote('replace') protected askReplace(
    _ask: FilesAsk & { replacement: string; paths?: string[] },
  ): Promise<{ files: number; replaced: number }> {
    return stub();
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry('editor.extension').add({ id: 'find', extension: this.extension() });
    this.ide.registry<() => unknown>('chrome.top').add(() => <FindFilesPopup keysFor={(command: string) => this.ide.getPlugin(KeymapPlugin).keysFor(command)} windows={this.ide.windows} files={this.files} code={this.ide.getPlugin(CodePlugin)} />);
    this.ide.registry('toolbar.button').add({
      id: 'find.files',
      title: 'toolbar.findFiles',
      command: 'find.files',
      icon: (filled: boolean) => <FindFilesIcon filled={filled} />,
      active: this.files.open,
    });

    const { find, files } = this;
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

    this.ide.command('find.files', () => files.toggle('find'));
    this.ide.command('find.filesReplace', () => files.toggle('replace'));
    this.ide.command('findFiles.next', () => files.move(1));
    this.ide.command('findFiles.prev', () => files.move(-1));
    this.ide.command('findFiles.accept', () => files.accept());
    this.ide.command('findFiles.close', () => files.close());
    this.ide.command('findFiles.nextField', () => files.nextField());
    this.ide.command('findFiles.toggleCase', () => files.toggleCase());
    this.ide.command('findFiles.toggleWords', () => files.toggleWords());
    this.ide.command('findFiles.toggleRegex', () => files.toggleRegex());
    this.ide.command('findFiles.addMask', () => files.addMask());
    this.ide.command('findFiles.replaceAll', () => files.replaceAll());
    this.ide.command('findFiles.replaceFile', () => files.replaceFile());
  }

  private extension() {
    const find = this.find;
    return [
      search({
        top: true,
        createPanel: () => {
          const dom = document.createElement('div');
          dom.className = 'find-host';
          render(
            <IdeProvider value={this.ide}>
              <FindBar keysFor={(command: string) => this.ide.getPlugin(KeymapPlugin).keysFor(command)} windows={this.ide.windows} find={find} />
            </IdeProvider>,
            dom,
          );
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
