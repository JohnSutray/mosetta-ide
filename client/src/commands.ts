import { commands } from './keys/commands.js';
import { activeMenu, activePick, popups } from '@ide/windows';

export function registerCommands(): void {
  commands.register('key.reserved', () => {});

  commands.register('pick.next', () => activePick.value?.next());
  commands.register('pick.prev', () => activePick.value?.prev());
  commands.register('pick.accept', () => activePick.value?.accept());
  commands.register('pick.expand', () => activePick.value?.expand?.());

  commands.register('menu.next', () => activeMenu.value?.next());
  commands.register('menu.prev', () => activeMenu.value?.prev());
  commands.register('menu.accept', () => activeMenu.value?.accept());

  commands.register('popup.close', () => {
    popups.closeTop();
  });
}
