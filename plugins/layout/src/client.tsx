import { Fragment } from 'preact';
import { activate, registry, type Ide } from '@ide/api/client';
import UiPlugin, { Resizer } from '@ide/ui';
import { PANEL_SCHEMA, type PanelWish } from './schema.js';
import { STYLE } from './style.js';

@registry({ key: 'panel', schema: PANEL_SCHEMA })
export default class Layout {
  private readonly keepFree = 320;
  private readonly fallbackWidth = 260;
  private readonly fallbackMin = 150;

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<() => unknown>('chrome.main').add(() => this.view());
  }

  private view() {
    const open = this.ide
      .registry<PanelWish>('panel')
      .all.value.filter((panel) => panel.open.value);
    const side = (which: PanelWish['side']) => open.filter((panel) => panel.side === which);

    return (
      <div class="columns">
        {side('left').map((panel) => (
          <Fragment key={panel.id}>
            {this.column(panel)}
            {this.grip(panel, 'left')}
          </Fragment>
        ))}

        {side('main').map((panel) => this.column(panel))}
        {side('main').length === 0 && <div class="columns-rest" />}

        {side('right').map((panel) => (
          <Fragment key={panel.id}>
            {this.grip(panel, 'right')}
            {this.column(panel)}
          </Fragment>
        ))}
      </div>
    );
  }

  private column(panel: PanelWish) {
    const main = panel.side === 'main';
    return (
      <section
        key={panel.id}
        class={`panel column-${panel.id} ${main ? 'is-main' : ''}`}
        style={main ? undefined : { width: `${this.width(panel)}px`, flex: 'none' }}
      >
        <header class="panel-head">
          <span class="panel-title">{panel.heading?.() ?? this.ide.t(panel.title)}</span>
          <span class="panel-actions">
            {panel.badges?.() as never}
            {panel.close && (
              <span class="panel-close" title={this.ide.t('panel.close')} onClick={panel.close}>
                ×
              </span>
            )}
          </span>
        </header>
        <div class="panel-body">{panel.view() as never}</div>
      </section>
    );
  }

  private grip(panel: PanelWish, side: 'left' | 'right') {
    return (
      <Resizer windows={this.ide.getPlugin(UiPlugin).windows}
        id={panel.id}
        side={side}
        defaultWidth={panel.defaultWidth ?? this.fallbackWidth}
        limits={() => ({
          min: panel.minWidth ?? this.fallbackMin,
          max: Math.max(
            panel.minWidth ?? this.fallbackMin,
            window.innerWidth - this.keepFree,
          ),
        })}
      />
    );
  }

  private width(panel: PanelWish): number {
    return this.ide.getPlugin(UiPlugin).windows.geometry.widthOf(panel.id, panel.defaultWidth ?? this.fallbackWidth);
  }
}
