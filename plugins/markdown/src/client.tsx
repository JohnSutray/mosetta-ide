import { activate, command, plugin, type Ide } from '@mosetta/ide-api/client';
import type { Signal } from '@preact/signals';
import CodePlugin from '@mosetta/ide-plugin-code';
import UiPlugin, { ModeSwitch } from '@mosetta/ide-plugin-ui';
import { Markdown } from './markdown.js';
import { MarkdownImages } from './images.js';
import { Page } from './render.js';
import { PreviewIcon, SplitIcon, TextIcon } from './icons.js';
import { STYLE } from './style.js';

export type MdMode = 'text' | 'both' | 'view';

/**
 * Showing markup — the second occupant of the `file.view` key.
 *
 * As in WebStorm: three modes — "text", "text and view", "view" — and they are switched
 * where one looks rather than in the settings.
 *
 * The text arrives as an ARGUMENT: in the middle it is the LIVE text of the document
 * (the page on the right changes as one types, without waiting for the server), and in
 * the search preview it is the text of the file being looked at.
 *
 * The parsing is our own and hands over a TREE rather than a string of HTML. The reason
 * is not pride: a string would have to be inserted with `dangerouslySetInnerHTML`, i.e.
 * executing what is written in a project's file, and a code block from it cannot be
 * painted by our painter — the very one that paints the editor.
 */
@plugin({ title: 'plugin.markdown' })
export default class MarkdownPlugin {
  private readonly markdown = new Markdown();
  private readonly images: MarkdownImages;

  /**
   * The mode is the tab's MEMORY: "let me look at it differently right now" rather than
   * "I want it this way always".
   */
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
      view: (file: { path: string; text: string }, editor: () => unknown) => this.view(file.path, file.text, editor),
    });
  }

  /** The key cycles through: text → text and view → view. */
  @command('markdown.mode')
  protected cycle(): void {
    const mode = this.mode();
    mode.value = mode.value === 'text' ? 'both' : mode.value === 'both' ? 'view' : 'text';
  }

  /**
   * The text arrives as an ARGUMENT: the same view draws the search preview, and there
   * is no open document there at all — having asked a neighbour for it, we would have
   * shown another file's markup.
   */
  private view(path: string, text: string, editor: () => unknown) {
    const mode = this.mode();
    const windows = this.ide.getPlugin(UiPlugin).windows;

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

/**
 * The word count. The one number people seriously ask about markup: "will this fit in
 * an email" and "has it grown out of hand".
 */
function words(text: string): number {
  return text.split(/\s+/).filter((one) => /[\p{L}\p{N}]/u.test(one)).length;
}
