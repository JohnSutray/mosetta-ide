import { Fragment } from 'preact';
import { signal } from '@preact/signals';
import { activate, plugin, registry, type Ide } from '@mosetta/ide-api/client';
import UiPlugin, { Resizer } from '@mosetta/ide-plugin-ui';
import { ColumnFit, type ColumnAsk } from './fit.js';
import { Overlay } from './overlay.js';
import {
  MAIN_OVERLAY_SCHEMA,
  PANEL_ACTION_SCHEMA,
  PANEL_SCHEMA,
  type MainOverlay,
  type PanelAction,
  type PanelWish,
} from './schema.js';
import { STYLE } from './style.js';

/**
 * The panel layout.
 *
 * Requirement two of the original brief: the interface consists ONLY of panels, no tabs
 * and no sidebars, and a panel above a panel does not happen at all — any split unfolds
 * into a column by one common rule. The tree and git press LEFT, working panels —
 * terminal, scripts, problems — open on the RIGHT, and the editor in the middle takes
 * the remainder.
 *
 * All of that is our idea of what an IDE looks like rather than a property of an IDE.
 * Which is why it is here rather than in the core. The core set aside a slot
 * (`chrome.main`), holds the registry of wishes, and knows nothing about columns, about
 * sides, or about the editor being in the middle: `side: 'main'` is as much a string to
 * it as `left`.
 *
 * From which the main inconvenience and the main honesty follow: without this plugin
 * what one sees is not a white screen but an explanation of who was supposed to draw
 * and why they did not. The layout is the one thing moved out of the core whose absence
 * cannot be survived in silence.
 */
@registry({ key: 'panel', schema: PANEL_SCHEMA })
@registry({ key: 'panel.action', schema: PANEL_ACTION_SCHEMA })
@registry({ key: 'main.overlay', schema: MAIN_OVERLAY_SCHEMA })
@plugin({ title: 'plugin.layout' })
export default class Layout {
  /**
   * How much of the screen the columns are not allowed to eat. This is the LAYOUT's
   * decision: a panel dragged across the whole screen leaves no room to drag it back.
   */
  private readonly keepFree = 320;
  private readonly fallbackWidth = 260;
  private readonly fallbackMin = 150;
  /** The sum of the side columns is guarded here rather than by each column separately. */
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

        <div class="columns-middle">
          {side('main').map((panel) => this.column(panel))}
          {side('main').length === 0 && <div class="columns-rest" />}
          {this.overlay()}
        </div>

        {side('right').map((panel) => (
          <Fragment key={panel.id}>
            {this.grip(panel, 'right', asks, shown[panel.id]!)}
            {this.column(panel, shown[panel.id])}
          </Fragment>
        ))}
      </div>
    );
  }

  /**
   * Who covered the middle. Several may be open — we show the LAST one: overlays do not
   * share the space, they cover one another, and it is honest to count whoever came
   * later as being on top.
   */
  private overlay() {
    const open = this.ide.registry<MainOverlay>('main.overlay').all.value.filter((one) => one.open.value);
    const top = open[open.length - 1];
    if (!top) return null;
    return (
      <Overlay
        key={top.id}
        overlay={top}
        title={top.heading?.() ?? this.ide.t(top.title)}
        closeTitle={this.ide.t('panel.close')}
      />
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

  /**
   * Neighbours' actions in THIS panel's header.
   *
   * The neighbour brings a description and we draw it: every button gets one size, one
   * backing and one tooltip — the same decision as with toolbar badges, and for the
   * same reason. A disabled button stays visible and explains itself through its
   * tooltip: one that vanished gets looked for as a missing feature.
   */
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

  /**
   * The strip one drags. The limits are worked out by the layout — they are its
   * business. The ceiling is computed with LIVE neighbours: what is left after the
   * middle and the other side columns, rather than after the middle alone. One drags
   * from the shown width rather than the remembered one: otherwise a squeezed column
   * would jump on the first movement of the mouse.
   */
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

  /**
   * Whoever was dragged last keeps their width, and the neighbours give way. The
   * resizer reports the grab itself (`onGrab`): guessing from a change in geometry will
   * not do — the remembered width is already at its ceiling, and dragging does not
   * change it, while the column still has to be shown.
   */
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
