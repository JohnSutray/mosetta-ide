import { activate, configSection, plugin, registry, type Ide } from '@mosetta/ide-api/client';
import { BUTTON_SCHEMA, WIDGET_SCHEMA, type ToolbarButton, type ToolbarChip, type ToolbarWidget } from './schema.js';
import { TOOLBAR_DEFAULTS , TOOLBAR_SCHEMA} from './settings.js';
import { STYLE } from './style.js';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * The toolbar.
 *
 * Every panel can be reached from here, and a button's look corresponds reactively to
 * its state: open means the icon is filled with a rounded square beneath it. The
 * buttons do not know what they do: they call a command by id, exactly as keys do.
 *
 * But the toolbar itself is a PLUGIN, and that is the main thing. The core does not
 * know it exists: it holds a registry and writes its wishes into it ("here is the tree,
 * here is its icon and command"), and whether those turn into a strip of icons, a
 * spotlight-like grid or nothing at all is none of its business.
 *
 * The keys' schema is declared by us: whoever reads knows the shape. The declaration
 * hangs on the CLASS, so the host sees it right after the import — before anyone has
 * started writing.
 */
@registry({ key: 'toolbar.button', schema: BUTTON_SCHEMA })
@registry({ key: 'toolbar.widget', schema: WIDGET_SCHEMA })
@configSection({ section: 'toolbar', defaults: TOOLBAR_DEFAULTS, schema: TOOLBAR_SCHEMA })
@plugin({ title: 'plugin.toolbar' })
export default class Toolbar {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<() => unknown>('chrome.top').add(() => this.view());
    this.ide.registry<ToolbarWidget>('toolbar.widget').add({
      id: 'connection',
      side: 'right',
      chip: () => {
        const live = this.ide.connected.value;
        return {
          icon: <span class={`dot ${live ? 'is-on' : 'is-off'}`} />,
          text: this.ide.t(live ? 'toolbar.online' : 'toolbar.offline'),
          tip: this.ide.t(live ? 'toolbar.connection.on' : 'toolbar.connection.off'),
          ...(live ? {} : { tone: 'bad' as const }),
        };
      },
    });
  }

  private view() {
    const widgets = this.ide.registry<ToolbarWidget>('toolbar.widget').all.value;
    const side = (which: 'left' | 'right') => widgets.filter((one) => one.side === which);

    return (
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="toolbar-icons">{this.buttons().map((one) => this.button(one))}</div>
          {side('left').map((one) => this.widget(one))}
        </div>
        <div class="toolbar-right">{side('right').map((one) => this.widget(one))}</div>
      </div>
    );
  }

  /**
   * A widget: either markup of your own, or a BADGE as data.
   *
   * We draw the badge, and so everyone's is the same: one size, one colour, one
   * backing, one tooltip. The neighbour brings the icon, the words, and what happens on
   * a click.
   */
  private widget(one: ToolbarWidget) {
    if (!one.chip) return one.view ? one.view() : null;
    const said = one.chip();
    if (Array.isArray(said)) return said.map((spec, at) => this.chip(spec.id ?? `${one.id}:${at}`, spec));
    return this.chip(one.id, said);
  }

  private chip(id: string, spec: ToolbarChip | null) {
    if (!spec) return null;
    const tips = this.ide.getPlugin(UiPlugin).windows.tips;
    const classes = [
      'toolbar-chip',
      `is-${spec.tone ?? 'plain'}`,
      spec.busy ? 'is-busy' : '',
      spec.onClick ? '' : 'is-still',
    ]
      .filter(Boolean)
      .join(' ');
    const hover = {
      onMouseEnter: (event: MouseEvent) => tips.show(event.currentTarget as Element, spec.tip, spec.keys ?? []),
      onMouseLeave: () => tips.hide(),
    };
    const inside = (
      <>
        <span class="toolbar-chip-icon">{spec.icon as never}</span>
        <span class="toolbar-chip-text">{spec.text as never}</span>
        {spec.more !== undefined && <span class="toolbar-chip-more">{spec.more as never}</span>}
      </>
    );

    if (!spec.onClick) {
      return (
        <span key={id} class={`${classes}`} {...hover}>
          {inside}
        </span>
      );
    }
    const press = spec.onClick;
    return (
      <button
        key={id}
        type="button"
        class={classes}
        {...hover}
        onClick={() => {
          tips.hide();
          press();
        }}
      >
        {inside}
      </button>
    );
  }

  private button(entry: ToolbarButton) {
    const active = entry.active?.value ?? false;
    const badge = entry.badge?.value ?? 0;
    return (
      <button
        key={entry.id}
        class={`tool ${active ? 'is-active' : ''}`}
        onMouseEnter={(event) =>
          this.ide.getPlugin(UiPlugin).windows.tips.show(event.currentTarget as Element, this.ide.t(entry.title), this.ide.getPlugin(KeymapPlugin).keysFor(entry.command))
        }
        onMouseLeave={() => this.ide.getPlugin(UiPlugin).windows.tips.hide()}
        onClick={() => {
          this.ide.getPlugin(UiPlugin).windows.tips.hide();
          this.ide.runCommand(entry.command);
        }}
      >
        {entry.icon(active)}
        {badge > 0 && <span class="tool-count">{badge}</span>}
      </button>
    );
  }

  /**
   * The buttons in the order from the settings.
   *
   * The order is data, like the keys and the labels. Whatever is not in the list goes
   * to the end in order of appearance; conditional buttons go there too, because the
   * list does not name them: a button that is sometimes absent has no right to occupy a
   * digit.
   */
  private buttons(): ToolbarButton[] {
    const order = this.ide.settingsOf('toolbar', TOOLBAR_DEFAULTS).value.order;
    const all = this.ide
      .registry<ToolbarButton>('toolbar.button')
      .all.value.filter((one) => one.visible?.value ?? true);
    const at = (one: ToolbarButton) => {
      const found = order.indexOf(one.command);
      return found === -1 ? order.length : found;
    };
    return all
      .map((one, was) => ({ one, was }))
      .sort((a, b) => at(a.one) - at(b.one) || a.was - b.was)
      .map((item) => item.one);
  }
}
