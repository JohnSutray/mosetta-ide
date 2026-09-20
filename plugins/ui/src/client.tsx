import { activate, command, plugin, registry } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { Tip } from './tip.js';
import { STYLE } from './style.js';
import { fuzzy } from './fuzzy.js';
import { matches } from './pick-popup.js';
import { Windows, type KeyCapture } from './windows/windows.js';
import type { Tips } from './windows/tips.js';

/** The tooltip is handed to neighbours as an entry rather than by import. */
const TIPS_SCHEMA = { type: 'object' } as const;

const CAPTURE_SCHEMA = {
  type: 'object',
  required: ['id', 'catches'],
  properties: { id: { type: 'string' }, catches: {} },
} as const;

export * from './index.js';

/**
 * The provider of the widgets, and the owner of their state.
 *
 * Its job is to BE the `@mosetta/ide-plugin-ui` package for everyone else and to bring
 * the styles of the frame, the list, the menu, the choice window and the tooltip. The
 * windows' state lives here too (`windows`): the stack, the tooltip, the sizes, the
 * active list and menu — and the commands that drive them (`pick.*`, `menu.*`,
 * `popup.close`). It draws one thing itself: the tooltip under the cursor.
 *
 * The interchangeable face is this one: another plugin providing the same names would
 * draw every window of every plugin differently without touching any of them.
 */
@registry({ key: 'ui.captures', schema: CAPTURE_SCHEMA })
@registry({ key: 'ui.tips', schema: TIPS_SCHEMA })
@plugin({ title: 'plugin.ui' })
export default class UiPlugin {
  /** Fuzzy search and match highlighting are instance fields. */
  readonly fuzzy = fuzzy;
  readonly matches = matches;

  /** The windows' state: neighbours take it from here, and components as a prop. */
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
  /**
   * Confirm the question modal.
   *
   * One command for every asker, because there is one modal: who opened it — the tree,
   * the changes panel, or whoever comes next — does not matter here. The one currently
   * on screen answers: there are never two.
   */
  @command('prompt.confirm') protected promptConfirm(): void { void this.windows.asking.value?.answer(); }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<() => unknown>('chrome.top').add(() => <Tip tips={this.windows.tips} />);
    this.ide.registry<Tips>('ui.tips').add(this.windows.tips);
  }
}
