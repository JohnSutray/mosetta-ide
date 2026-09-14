import { activate, command, plugin } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { KeysIcon } from './icons.js';
import { KeysPopup } from './popup.js';
import { KeysWindow } from './state.js';
import { STYLE } from './style.js';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import UiPlugin from '@mosetta/ide-plugin-ui';

@plugin({ title: 'plugin.keys' })
export default class KeysPlugin {
  readonly window = new KeysWindow();

  constructor(private readonly ide: Ide) {}

  @command('keys.show') protected show(): void { this.window.toggle(); }

  @activate() protected start(): void {
    this.ide.css(STYLE);

    this.ide.registry('toolbar.button').add({
      id: 'keys',
      title: 'toolbar.keys',
      command: 'keys.show',
      icon: (filled: boolean) => <KeysIcon filled={filled} />,
      active: this.window.open,
    });

    this.ide.registry<() => unknown>('chrome.top').add(() => <KeysPopup keys={this.ide.getPlugin(KeymapPlugin).keys} windows={this.ide.getPlugin(UiPlugin).windows} window={this.window} />);
  }
}
