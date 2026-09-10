import { activate } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { KeysIcon } from './icons.js';
import { KeysPopup } from './popup.js';
import { KeysWindow } from './state.js';
import { STYLE } from './style.js';
import KeymapPlugin from '@ide/plugin-keymap';

export default class KeysPlugin {
  readonly window = new KeysWindow();

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.command('keys.show', () => this.window.toggle());

    this.ide.registry('toolbar.button').add({
      id: 'keys',
      title: 'toolbar.keys',
      command: 'keys.show',
      icon: (filled: boolean) => <KeysIcon filled={filled} />,
      active: this.window.open,
    });

    this.ide.registry<() => unknown>('chrome.top').add(() => <KeysPopup keys={this.ide.getPlugin(KeymapPlugin).keys} windows={this.ide.windows} window={this.window} />);
  }
}
