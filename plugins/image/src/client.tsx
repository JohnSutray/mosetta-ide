import { activate, plugin, type Ide } from '@mosetta/ide-api/client';
import { signal, type Signal } from '@preact/signals';
import UiPlugin from '@mosetta/ide-plugin-ui';
import { ImageKinds } from './kinds.js';
import { ImageStore } from './state.js';
import { RasterView, SvgView, type Ground, type SvgMode } from './view.js';
import { STYLE } from './style.js';

/**
 * Showing images — the first occupant of the `file.view` key.
 *
 * Showing a file does not necessarily mean showing its text. An image is shown as an
 * image; until now it simply did not open ("the file is not textual"), which was honest
 * but useless.
 *
 * Two entries rather than one, because there are two cases and they differ in
 * substance:
 *
 * * raster (`png`, `jpg`, …) — it has NO text, and asking for a document is not on. The bytes arrive on demand, through the third layer of reading;
 * * `svg` — an image MADE OF TEXT. It does need a document: people both edit it and look at it, and we show both at once.
 *
 * A separate plugin rather than "part of the editor": everything is not dragged into
 * one plugin, because an abstraction that lets anyone add a viewer or an editor per
 * file type has a right to exist.
 */
@plugin({ title: 'plugin.image' })
export default class ImagePlugin {
  private readonly kinds = new ImageKinds();
  private readonly store: ImageStore;

  /**
   * The backing and the mode are the tab's MEMORY rather than a setting: this is about
   * "let me look at it differently right now" rather than "I want it this way always".
   * Created lazily: `ide.remember` may not be called before the plugin comes up.
   */
  private groundMemory: Signal<Ground> | null = null;
  private modeMemory: Signal<SvgMode> | null = null;

  constructor(private readonly ide: Ide) {
    this.store = new ImageStore(this.ide.fs, (err) => (err instanceof Error ? err.message : String(err)));
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);

    this.ide.registry('file.view').add({
      id: 'image',
      opens: (path: string) => this.kinds.isRaster(path),
      text: false,
      view: (file: { path: string; text: string }) => (
        <RasterView
          key={file.path}
          path={file.path}
          store={this.store}
          windows={this.ide.getPlugin(UiPlugin).windows}
          ground={this.ground()}
          fit={this.fit}
          t={(key, params) => this.ide.t(key, params)}
        />
      ),
    });

    this.ide.registry('file.view').add({
      id: 'svg',
      opens: (path: string) => this.kinds.isSvg(path),
      text: true,
      view: (file: { path: string; text: string }, editor: () => unknown) => (
        <SvgView
          key={file.path}
          path={file.path}
          text={file.text}
          windows={this.ide.getPlugin(UiPlugin).windows}
          ground={this.ground()}
          mode={this.mode()}
          editor={editor}
          t={(key, params) => this.ide.t(key, params)}
        />
      ),
    });
  }

  /** Fit it to the panel, or show it pixel for pixel. */
  private readonly fit = signal(true);

  private ground(): Signal<Ground> {
    this.groundMemory ??= this.ide.remember<Ground>('ground', 'checker');
    return this.groundMemory;
  }

  private mode(): Signal<SvgMode> {
    this.modeMemory ??= this.ide.remember<SvgMode>('svgMode', 'both');
    return this.modeMemory;
  }
}
