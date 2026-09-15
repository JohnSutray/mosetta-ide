import { activate, command, plugin, type Ide } from '@mosetta/ide-api/client';
import type { Signal } from '@preact/signals';
import CodePlugin from '@mosetta/ide-plugin-code';
import DocPlugin from '@mosetta/ide-plugin-doc';
import UiPlugin, { ModeSwitch } from '@mosetta/ide-plugin-ui';
import { Markdown } from './markdown.js';
import { MarkdownImages } from './images.js';
import { Page } from './render.js';
import { PreviewIcon, SplitIcon, TextIcon } from './icons.js';
import { STYLE } from './style.js';

export type MdMode = 'text' | 'both' | 'view';

@plugin({ title: 'plugin.markdown' })
export default class MarkdownPlugin {
  private readonly markdown = new Markdown();
  private readonly images: MarkdownImages;

  private modeMemory: Signal<MdMode> | null = null;

  constructor(private readonly ide: Ide) {
    this.images = new MarkdownImages(this.ide.fs);
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry('file.view').add({
      id: 'markdown',
      opens: (path: string) => /\.(md|markdown)$/i.test(path),
      text: true,
      view: (file: { path: string }, editor: () => unknown) => this.view(file.path, editor),
    });
  }

  @command('markdown.mode')
  protected cycle(): void {
    const mode = this.mode();
    mode.value = mode.value === 'text' ? 'both' : mode.value === 'both' ? 'view' : 'text';
  }

  private view(path: string, editor: () => unknown) {
    const mode = this.mode();
    const windows = this.ide.getPlugin(UiPlugin).windows;
    const text = this.ide.getPlugin(DocPlugin).liveText.value;

    return (
      <div class="md-host">
        <div class="md-bar">
          <ModeSwitch
            windows={windows}
            value={mode.value}
            options={[
              { id: 'text' as MdMode, icon: <TextIcon />, tip: this.ide.t('markdown.mode.text') },
              { id: 'both' as MdMode, icon: <SplitIcon />, tip: this.ide.t('markdown.mode.both') },
              { id: 'view' as MdMode, icon: <PreviewIcon />, tip: this.ide.t('markdown.mode.view') },
            ]}
            onPick={(id) => (mode.value = id)}
          />
          <span class="md-facts">{this.ide.t('markdown.words', { count: words(text) })}</span>
        </div>
        <div class="md-split">
          {mode.value !== 'view' ? <div class="md-text">{editor() as never}</div> : null}
          {mode.value !== 'text' ? (
            <div class="md-preview">
              <Page
                blocks={this.markdown.blocks(text)}
                draw={{
                  painter: this.ide.getPlugin(CodePlugin).painter,
                  images: this.images,
                  path,
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  private mode(): Signal<MdMode> {
    this.modeMemory ??= this.ide.remember<MdMode>('mode', 'both');
    return this.modeMemory;
  }
}

function words(text: string): number {
  return text.split(/\s+/).filter((one) => /[\p{L}\p{N}]/u.test(one)).length;
}
