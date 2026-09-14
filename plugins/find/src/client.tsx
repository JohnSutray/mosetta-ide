import CodePlugin from '@mosetta/ide-plugin-code';
import { activate, command, configSection, IdeProvider, plugin, remote, stub, type Ide } from '@mosetta/ide-api/client';
import { search } from '@codemirror/search';
import { ViewPlugin } from '@codemirror/view';
import { computed } from '@preact/signals';
import { render } from 'preact';
import { FindState } from './find.js';
import { FindBar } from './find-bar.js';
import { FindFiles, type FilesAsk, type FindFilesRemote } from './files.js';
import { FindFilesPopup } from './files-popup.js';
import type { GrepResult } from './grep.js';
import { HitLine } from './hit-line.js';
import { FIND_DEFAULTS , FIND_SCHEMA} from './settings.js';
import { STYLE } from './style.js';
import { FindFilesIcon } from './icons.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import UiPlugin from '@mosetta/ide-plugin-ui';

export type { FileHit, GrepResult } from './grep.js';

@configSection({ section: 'find', defaults: FIND_DEFAULTS, schema: FIND_SCHEMA })
@plugin({ title: 'plugin.find' })
export default class FindPlugin implements FindFilesRemote {
  readonly find = new FindState();
  readonly files: FindFiles;
  readonly line = new HitLine((text, path) => this.ide.getPlugin(CodePlugin).painter.paint(text, path));

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
    this.ide.registry<() => unknown>('chrome.top').add(() => <FindFilesPopup keysFor={(command: string) => this.ide.getPlugin(KeymapPlugin).keysFor(command)} windows={this.ide.getPlugin(UiPlugin).windows} files={this.files} code={this.ide.getPlugin(CodePlugin)} line={this.line} />);
    this.ide.registry('toolbar.button').add({
      id: 'find.files',
      title: 'toolbar.findFiles',
      command: 'find.files',
      icon: (filled: boolean) => <FindFilesIcon filled={filled} />,
      active: this.files.open,
    });
  }

  @command('find.open') protected openFind(): void { this.find.open('find'); }
  @command('find.replace') protected openReplace(): void { this.find.open('replace'); }
  @command('find.next') protected next(): void { this.find.next(); }
  @command('find.prev') protected prev(): void { this.find.prev(); }
  @command('find.close') protected close(): void { this.find.close(); }
  @command('find.newline') protected newline(): void { this.find.newline(); }
  @command('find.toggleCase') protected toggleCase(): void { this.find.toggleCase(); }
  @command('find.toggleWords') protected toggleWords(): void { this.find.toggleWords(); }
  @command('find.toggleRegex') protected toggleRegex(): void { this.find.toggleRegex(); }
  @command('find.replaceOne') protected replaceOne(): void { this.find.replaceOne(); }
  @command('find.replaceAll') protected replaceAll(): void { this.find.replaceEverything(); }

  @command('find.files') protected filesFind(): void { this.files.toggle('find'); }
  @command('find.filesReplace') protected filesReplace(): void { this.files.toggle('replace'); }
  @command('findFiles.next') protected filesNext(): void { this.files.move(1); }
  @command('findFiles.prev') protected filesPrev(): void { this.files.move(-1); }
  @command('findFiles.accept') protected filesAccept(): void { this.files.accept(); }
  @command('findFiles.close') protected filesClose(): void { this.files.close(); }
  @command('findFiles.nextField') protected filesNextField(): void { this.files.nextField(); }
  @command('findFiles.toggleCase') protected filesToggleCase(): void { this.files.toggleCase(); }
  @command('findFiles.toggleWords') protected filesToggleWords(): void { this.files.toggleWords(); }
  @command('findFiles.toggleRegex') protected filesToggleRegex(): void { this.files.toggleRegex(); }
  @command('findFiles.addMask') protected filesAddMask(): void { this.files.addMask(); }
  @command('findFiles.replaceAll') protected filesReplaceAll(): void { this.files.replaceAll(); }
  @command('findFiles.replaceFile') protected filesReplaceFile(): void { this.files.replaceFile(); }

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
              <FindBar keysFor={(command: string) => this.ide.getPlugin(KeymapPlugin).keysFor(command)} windows={this.ide.getPlugin(UiPlugin).windows} find={find} />
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
