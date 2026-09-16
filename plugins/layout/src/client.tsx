import { Fragment } from 'preact';
import { signal } from '@preact/signals';
import { activate, plugin, registry, type Ide } from '@mosetta/ide-api/client';
import UiPlugin, { Resizer } from '@mosetta/ide-plugin-ui';
import { ColumnFit, type ColumnAsk } from './fit.js';
import { PANEL_ACTION_SCHEMA, PANEL_SCHEMA, type PanelAction, type PanelWish } from './schema.js';
import { STYLE } from './style.js';

@registry({ key: 'panel', schema: PANEL_SCHEMA })
@registry({ key: 'panel.action', schema: PANEL_ACTION_SCHEMA })
@plugin({ title: 'plugin.layout' })
export default class Layout {
  private readonly keepFree = 320;
  private readonly fallbackWidth = 260;
  private readonly fallbackMin = 150;
  private readonly fit = new ColumnFit(this.keepFree);

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
    const asks = this.asks(open);
    const shown = this.fit.fit(this.total(), asks, this.kept.value);

    return (
      <div class="columns">
        {side('left').map((panel) => (
          <Fragment key={panel.id}>
            {this.column(panel, shown[panel.id])}
            {this.grip(panel, 'left', asks, shown[panel.id]!)}
          </Fragment>
        ))}

        {side('main').map((panel) => this.column(panel))}
        {side('main').length === 0 && <div class="columns-rest" />}

        {side('right').map((panel) => (
          <Fragment key={panel.id}>
            {this.grip(panel, 'right', asks, shown[panel.id]!)}
            {this.column(panel, shown[panel.id])}
          </Fragment>
        ))}
      </div>
    );
  }

  private column(panel: PanelWish, width?: number) {
    const main = panel.side === 'main';
    return (
      <section
        key={panel.id}
        class={`panel column-${panel.id} ${main ? 'is-main' : ''}`}
        style={main ? undefined : { width: `${width ?? this.width(panel)}px`, flex: 'none' }}
      >
        <header class="panel-head">
          <span class="panel-title">{panel.heading?.() ?? this.ide.t(panel.title)}</span>
          <span class="panel-actions">
            {panel.badges?.() as never}
            {this.actionsOf(panel.id)}
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

  private actionsOf(panel: string) {
    const tips = this.ide.getPlugin(UiPlugin).windows.tips;
    return this.ide
      .registry<PanelAction>('panel.action')
      .all.value.filter((action) => action.panel === panel)
      .map((action) => {
        const enabled = action.enabled?.() ?? true;
        return (
          <button
            key={action.id}
            type="button"
            class="panel-action"
            disabled={!enabled}
            onMouseEnter={(event) =>
              tips.show(event.currentTarget as Element, this.ide.t(action.title), action.keys?.() ?? [])
            }
            onMouseLeave={() => tips.hide()}
            onClick={() => {
              tips.hide();
              action.run();
            }}
          >
            {action.icon() as never}
          </button>
        );
      });
  }

  private grip(panel: PanelWish, side: 'left' | 'right', asks: ColumnAsk[], shown: number) {
    return (
      <Resizer windows={this.ide.getPlugin(UiPlugin).windows}
        id={panel.id}
        side={side}
        defaultWidth={panel.defaultWidth ?? this.fallbackWidth}
        width={() => shown}
        onGrab={() => { this.kept.value = panel.id; }}
        limits={() => ({
          min: this.min(panel),
          max: Math.max(this.min(panel), this.fit.maxFor(this.total(), panel.id, asks)),
        })}
      />
    );
  }

  private readonly kept = signal<string | undefined>(undefined);

  private asks(open: PanelWish[]): ColumnAsk[] {
    return open
      .filter((panel) => panel.side !== 'main')
      .map((panel) => ({ id: panel.id, width: this.width(panel), min: this.min(panel) }));
  }

  private total(): number {
    return this.ide.mount.size.value.w;
  }

  private min(panel: PanelWish): number {
    return panel.minWidth ?? this.fallbackMin;
  }

  private width(panel: PanelWish): number {
    return this.ide.getPlugin(UiPlugin).windows.geometry.widthOf(panel.id, panel.defaultWidth ?? this.fallbackWidth);
  }
}
