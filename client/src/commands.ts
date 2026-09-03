import { commands } from './keys/commands.js';
import { keysHelp } from './state/keys-help.js';
import { visits } from './state/visits.js';
import { doc } from './state/session.js';
import { projects } from './state/projects.js';
import { tools } from './state/tools.js';
import { activeMenu, activePick, popups } from '@ide/ui';

export function registerCommands(): void {
  commands.register('file.save', () => doc.save());
  commands.register('file.reload', () => doc.reload());

  commands.register('nav.back', () => visits.back());
  commands.register('nav.forward', () => visits.forward());

  commands.register('key.reserved', () => {});

  commands.register('keys.show', () => keysHelp.toggle());

  commands.register('terminal.shell', () => tools.open('shell'));
  commands.register('tools.packageManager', () => tools.open('manager'));

  commands.register('projects.show', () => projects.toggle());
  commands.register('projects.next', () => projects.moveSuggestion(1));
  commands.register('projects.prev', () => projects.moveSuggestion(-1));
  commands.register('projects.suggest', () => projects.openSuggest());
  commands.register('projects.complete', () => projects.complete());
  commands.register('projects.accept', () => projects.accept());
  commands.register('projects.close', () => {
    if (projects.suggestOpen.peek()) projects.closeSuggest();
    else projects.hide();
  });

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
