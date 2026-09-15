import { activate, plugin, type Ide } from '@mosetta/ide-api/client';
import { signal, type Signal } from '@preact/signals';
import UiPlugin from '@mosetta/ide-plugin-ui';
import { ImageKinds } from './kinds.js';
import { ImageStore } from './state.js';
import { RasterView, SvgView, type Ground, type SvgMode } from './view.js';
import { STYLE } from './style.js';

@plugin({ title: 'plugin.image' })
export default class ImagePlugin {
  private readonly kinds = new ImageKinds();
  private readonly store: ImageStore;

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
