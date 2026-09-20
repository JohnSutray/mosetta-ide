import { activate, command, plugin, registry } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { Tip } from './tip.js';
import { STYLE } from './style.js';
import { fuzzy } from './fuzzy.js';
import { matches } from './pick-popup.js';
import { Windows, type KeyCapture } from './windows/windows.js';
import type { Tips } from './windows/tips.js';

const TIPS_SCHEMA = { type: 'object' } as const;

const CAPTURE_SCHEMA = {
  type: 'object',
  required: ['id', 'catches'],
  properties: { id: { type: 'string' }, catches: {} },
} as const;

export * from './index.js';

@registry({ key: 'ui.captures', schema: CAPTURE_SCHEMA })
@registry({ key: 'ui.tips', schema: TIPS_SCHEMA })
@plugin({ title: 'plugin.ui' })
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

  @command('pick.next') protected pickNext(): void { this.windows.activePick.value?.next(); }
  @command('pick.prev') protected pickPrev(): void { this.windows.activePick.value?.prev(); }
  @command('pick.accept') protected pickAccept(): void { this.windows.activePick.value?.accept(); }
  @command('pick.expand') protected pickExpand(): void { this.windows.activePick.value?.expand?.(); }
  @command('menu.next') protected menuNext(): void { this.windows.activeMenu.value?.next(); }
  @command('menu.prev') protected menuPrev(): void { this.windows.activeMenu.value?.prev(); }
  @command('menu.accept') protected menuAccept(): void { this.windows.activeMenu.value?.accept(); }
  @command('popup.close') protected popupClose(): void { this.windows.popups.closeTop(); }
  @command('prompt.confirm') protected promptConfirm(): void { void this.windows.asking.value?.answer(); }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<() => unknown>('chrome.top').add(() => <Tip tips={this.windows.tips} />);
    this.ide.registry<Tips>('ui.tips').add(this.windows.tips);
  }
}
