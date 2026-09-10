import {
  activate,
  configSection,
  connected,
  registry,
  runCommand,
  settingsOf,
  t,
  type Ide,
} from '@ide/api/client';
import { BUTTON_SCHEMA, WIDGET_SCHEMA, type ToolbarButton, type ToolbarWidget } from './schema.js';
import { TOOLBAR_DEFAULTS } from './settings.js';
import { STYLE } from './style.js';
import KeymapPlugin from '@ide/plugin-keymap';

@registry({ key: 'toolbar.button', schema: BUTTON_SCHEMA })
@registry({ key: 'toolbar.widget', schema: WIDGET_SCHEMA })
@configSection({ section: 'toolbar', defaults: TOOLBAR_DEFAULTS })
export default class Toolbar {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<() => unknown>('chrome.top').add(() => this.view());
    this.ide.registry<ToolbarWidget>('toolbar.widget').add({
      id: 'connection',
      side: 'right',
      view: () => (
        <span class={`dot ${connected.value ? 'is-on' : 'is-off'}`} title={t('toolbar.connection')} />
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
          this.ide.windows.tips.show(event.currentTarget as Element, t(entry.title), this.ide.getPlugin(KeymapPlugin).keysFor(entry.command))
        }
        onMouseLeave={() => this.ide.windows.tips.hide()}
        onClick={() => {
          this.ide.windows.tips.hide();
          runCommand(entry.command);
        }}
      >
        {entry.icon(active)}
        {badge > 0 && <span class="tool-count">{badge}</span>}
      </button>
    );
  }

  private buttons(): ToolbarButton[] {
    const order = settingsOf('toolbar', TOOLBAR_DEFAULTS).value.order;
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
