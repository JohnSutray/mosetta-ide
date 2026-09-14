import { activate, command, plugin, registry, settingsKey, type Ide, type SettingsEntry } from '@mosetta/ide-api/client';
import UiPlugin from '@mosetta/ide-plugin-ui';
import { SettingsIcon } from './icons.js';
import { SettingsPopup } from './popup.js';
import { SettingsModel, SettingsWindow } from './state.js';
import { STYLE } from './style.js';

export const REVEAL_SCHEMA = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' }, reveal: {} },
  additionalProperties: false,
} as const;

export interface RevealLike {
  reveal(query: string): void;
}

@registry({ key: 'settings.reveal', schema: REVEAL_SCHEMA })
@plugin({ title: 'plugin.settings' })
export default class SettingsPlugin {
  readonly window = new SettingsWindow();
  readonly model = new SettingsModel();

  constructor(private readonly ide: Ide) {}

  @command('settings.show') protected show(): void { this.window.toggle(); }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<RevealLike>('settings.reveal').add({
      id: 'settings',
      reveal: (query: string) => {
        this.window.term.value = query;
        this.window.open.value = true;
      },
    } as RevealLike & { id: string });
    this.ide.registry('toolbar.button').add({
      id: 'settings',
      title: 'toolbar.settings',
      command: 'settings.show',
      icon: (filled: boolean) => <SettingsIcon filled={filled} />,
      active: this.window.open,
    });
    const entries = this.ide.registry<SettingsEntry>('settings').all;
    const layersOf = (section: string) => this.ide.registry<object>(settingsKey(section)).entries.value;
    this.ide
      .registry<() => unknown>('chrome.top')
      .add(() => (
        <SettingsPopup
          windows={this.ide.getPlugin(UiPlugin).windows}
          window={this.window}
          model={this.model}
          entries={entries}
          layersOf={layersOf}
        />
      ));
  }
}
