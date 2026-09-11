import { activate, registry } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { Tip } from './tip.js';
import { STYLE } from './style.js';
import { fuzzy } from './fuzzy.js';
import { matches } from './pick-popup.js';
import { Windows, type KeyCapture } from './windows/windows.js';

const CAPTURE_SCHEMA = {
  type: 'object',
  required: ['id', 'catches'],
  properties: { id: { type: 'string' }, catches: {} },
} as const;

export * from './index.js';

@registry({ key: 'ui.captures', schema: CAPTURE_SCHEMA })
export default class UiPlugin {
  readonly fuzzy = fuzzy;
  readonly matches = matches;

  readonly windows: Windows;

  constructor(private readonly ide: Ide) {
    this.windows = new Windows(
      <T,>(key: string, initial: T) => ide.remember<T>(key, initial),
      () => ide.registry<KeyCapture>('ui.captures').all.value,
      ide.mount,
    );
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<() => unknown>('chrome.top').add(() => <Tip tips={this.windows.tips} />);

    const windows = this.windows;
    this.ide.command('pick.next', () => windows.activePick.value?.next());
    this.ide.command('pick.prev', () => windows.activePick.value?.prev());
    this.ide.command('pick.accept', () => windows.activePick.value?.accept());
    this.ide.command('pick.expand', () => windows.activePick.value?.expand?.());
    this.ide.command('menu.next', () => windows.activeMenu.value?.next());
    this.ide.command('menu.prev', () => windows.activeMenu.value?.prev());
    this.ide.command('menu.accept', () => windows.activeMenu.value?.accept());
    this.ide.command('popup.close', () => {
      windows.popups.closeTop();
    });
  }
}
