import { activate, configSection, plugin, registry, type Ide } from '@mosetta/ide-api/client';
import { BUTTON_SCHEMA, WIDGET_SCHEMA, type ToolbarButton, type ToolbarWidget } from './schema.js';
import { TOOLBAR_DEFAULTS } from './settings.js';
import { STYLE } from './style.js';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import UiPlugin from '@mosetta/ide-plugin-ui';

@registry({ key: 'toolbar.button', schema: BUTTON_SCHEMA })
@registry({ key: 'toolbar.widget', schema: WIDGET_SCHEMA })
@configSection({ section: 'toolbar', defaults: TOOLBAR_DEFAULTS })
@plugin({ title: 'plugin.toolbar' })
export default class Toolbar {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<() => unknown>('chrome.top').add(() => this.view());
    this.ide.registry<ToolbarWidget>('toolbar.widget').add({
      id: 'connection',
      side: 'right',
      view: () => (
        <span class={`dot ${this.ide.connected.value ? 'is-on' : 'is-off'}`} title={this.ide.t('toolbar.connection')} />
      ),
    });
  }

  private view() {
    const widgets = this.ide.registry<ToolbarWidget>('toolbar.widget').all.value;
    const side = (which: 'left' | 'right') => widgets.filter((one) => one.side === which);

    return (
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="toolbar-icons">{this.buttons().map((one) => this.button(one))}</div>
          {side('left').map((one) => one.view())}
        </div>
        <div class="toolbar-right">{side('right').map((one) => one.view())}</div>
      </div>
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
