import { activate, command, plugin } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { KeysIcon } from './icons.js';
import { KeysPopup } from './popup.js';
import { KeysWindow } from './state.js';
import { STYLE } from './style.js';
import KeymapPlugin from '@mosetta/ide-plugin-keymap';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * The keys window is a plugin.
 *
 * The core listens to the keyboard, and it is the core that knows what a keystroke
 * turned into, which environment we are in and what has been taken from us; all of that
 * arrives through the keys facade. Here is the window: the resolved keymap by surface,
 * an echo of the last keystroke, two sections of what was taken away, and a switch
 * between layouts.
 *
 * The window CATCHES keys: its surface shows a keystroke as an echo but does not
 * execute the command — a tool for checking keys has no right to change the editor's
 * state. Which is also why Escape closes nothing here; the way out is the cross, or the
 * same key again.
 */
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
