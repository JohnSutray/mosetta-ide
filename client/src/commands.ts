import { treeFollow } from './state/tree-follow.js';
import { commands } from './keys/commands.js';
import { keysHelp } from './state/keys-help.js';
import { editorFocus } from './state/editor.js';
import { symbols } from './state/symbols.js';
import { visits } from './state/visits.js';
import { search } from './state/search.js';
import { panels } from './ui/panels.js';
import { doc, fileTree } from './state/session.js';
import { prompt, tree, treeOps } from './state/tree-ops.js';
import { merge } from './state/merge.js';
import { projects } from './state/projects.js';
import { tools } from './state/tools.js';
import { branchesWindow, pushWindow } from './state/git.js';
import { activeMenu, activePick, popups } from '@ide/ui';

export function registerCommands(): void {
  commands.register('file.save', () => doc.save());
  commands.register('file.reload', () => doc.reload());

  commands.register('nav.back', () => visits.back());
  commands.register('nav.forward', () => visits.forward());

  commands.register('key.reserved', () => {});

  commands.register('keys.show', () => keysHelp.toggle());

  commands.register('merge.show', () => merge.toggle());
  commands.register('merge.nextFile', () => merge.stepFile(1));
  commands.register('merge.prevFile', () => merge.stepFile(-1));
  commands.register('merge.next', () => merge.stepConflict(1));
  commands.register('merge.prev', () => merge.stepConflict(-1));
  commands.register('merge.takeLeft', () => merge.decideHere('left', 'take'));
  commands.register('merge.takeRight', () => merge.decideHere('right', 'take'));
  commands.register('merge.skipLeft', () => merge.decideHere('left', 'skip'));
  commands.register('merge.skipRight', () => merge.decideHere('right', 'skip'));
  commands.register('merge.confirm', () => void merge.resolve());

  commands.register('panel.tree', () => {
    panels.tree.value = !panels.tree.value;
  });

  commands.register('tree.next', () => tree.step(1));
  commands.register('tree.prev', () => tree.step(-1));
  commands.register('tree.expand', () => tree.openBranch());
  commands.register('tree.collapse', () => tree.closeBranch());
  commands.register('tree.newFile', () => onFocused((path, isDir) => treeOps.create(path, isDir, 'file')));
  commands.register('tree.newFolder', () => onFocused((path, isDir) => treeOps.create(path, isDir, 'dir')));
  commands.register('tree.open', () =>
    onPicked((path, isDir) => {
      if (isDir) void fileTree.toggle(path);
      else void doc.openAt(path).then(editorFocus.focus);
    }),
  );
  commands.register('tree.rename', () => onPicked((path) => treeOps.rename(path)));
  commands.register('tree.delete', () => onPicked((path, isDir) => treeOps.remove(path, isDir)));
  commands.register('tree.copy', () => onPicked((path) => treeOps.copy(path, false)));
  commands.register('tree.cut', () => onPicked((path) => treeOps.copy(path, true)));
  commands.register('tree.paste', () => onFocused((path, isDir) => void treeOps.pasteInto(path, isDir)));
  commands.register('tree.copyPath', () => onPicked((path) => void treeOps.copyAbsolutePath(path)));
  commands.register('tree.reveal', () => onPicked((path) => void treeOps.revealInOs(path)));
  commands.register('tree.follow', () => void treeFollow.toggle());
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

  commands.register('git.branches', () => branchesWindow.show());
  commands.register('git.push', () => void pushWindow.show());
  commands.register('git.fetch', () => void branchesWindow.do('fetch'));
  commands.register('pick.next', () => (symbols.list.value ? symbols.step(1) : activePick.value?.next()));
  commands.register('pick.prev', () => (symbols.list.value ? symbols.step(-1) : activePick.value?.prev()));
  commands.register('pick.accept', () => (symbols.list.value ? symbols.accept() : activePick.value?.accept()));
  commands.register('pick.expand', () => activePick.value?.expand?.());

  commands.register('prompt.confirm', () => void prompt.answer());

  commands.register('menu.next', () => activeMenu.value?.next());
  commands.register('menu.prev', () => activeMenu.value?.prev());
  commands.register('menu.accept', () => activeMenu.value?.accept());

  commands.register('popup.close', () => {
    popups.closeTop();
  });

  commands.register('search.everywhere', () => search.show());
  commands.register('search.next', () => search.move(1));
  commands.register('search.prev', () => search.move(-1));
  commands.register('search.accept', () => search.accept());
  commands.register('search.close', () => search.close());
}

function onFocused(run: (path: string, isDir: boolean) => void): void {
  const path = tree.focus.value ?? '';
  const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
  const entry = fileTree.children.value.get(parent)?.find((item) => item.path === path);
  run(path, path === '' ? true : entry?.kind === 'dir');
}

function onPicked(run: (path: string, isDir: boolean) => void): void {
  const path = tree.focus.value;
  if (!path) return;
  onFocused(run);
}
