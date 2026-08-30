import { prompt, tree, treeOps } from './state/tree-ops.js';
import { merge } from './state/merge.js';
import { projects } from './state/projects.js';
import { tools } from './state/tools.js';
import { branchesWindow, pushWindow } from './state/git.js';
import { registerCommand, missingCommands } from './keys/commands.js';
import { toggleFollow } from './state/tree-follow.js';
import { resolveContext } from './keys/context.js';
import { acceptSelected, closeSearch, moveSelection, openSearch } from './state/search.js';
import { focusEditor } from './state/editor.js';
import { closeTop } from './state/popups.js';
import { activePick } from './state/pick.js';
import { activeMenu } from './state/menu.js';
import { toggleKeysHelp } from './state/keys-help.js';
import { goBack, goForward } from './state/visits.js';
import { accept as acceptSymbol, step as stepSymbol, symbolList } from './state/symbols.js';
import { dirChildren, openFileAt, toggleDir } from './state/session.js';
import {
  reloadDoc,
  saveDoc,
  terminalPanelVisible,
  treePanelVisible,
} from './state/session.js';
import { createTerminal } from './state/terminals.js';

export function registerCommands(): void {
  registerCommand('file.save', () => saveDoc());
  registerCommand('file.reload', () => reloadDoc());

  registerCommand('nav.back', () => goBack());
  registerCommand('nav.forward', () => goForward());

  registerCommand('key.reserved', () => {});

  registerCommand('keys.show', () => toggleKeysHelp());

  registerCommand('merge.show', () => merge.toggle());
  registerCommand('merge.nextFile', () => merge.stepFile(1));
  registerCommand('merge.prevFile', () => merge.stepFile(-1));
  registerCommand('merge.next', () => merge.stepConflict(1));
  registerCommand('merge.prev', () => merge.stepConflict(-1));
  registerCommand('merge.takeLeft', () => merge.decideHere('left', 'take'));
  registerCommand('merge.takeRight', () => merge.decideHere('right', 'take'));
  registerCommand('merge.skipLeft', () => merge.decideHere('left', 'skip'));
  registerCommand('merge.skipRight', () => merge.decideHere('right', 'skip'));
  registerCommand('merge.confirm', () => void merge.resolve());

  registerCommand('panel.tree', () => {
    treePanelVisible.value = !treePanelVisible.value;
  });

  registerCommand('tree.next', () => tree.step(1));
  registerCommand('tree.prev', () => tree.step(-1));
  registerCommand('tree.expand', () => tree.openBranch());
  registerCommand('tree.collapse', () => tree.closeBranch());
  registerCommand('tree.newFile', () => onFocused((path, isDir) => treeOps.create(path, isDir, 'file')));
  registerCommand('tree.newFolder', () => onFocused((path, isDir) => treeOps.create(path, isDir, 'dir')));
  registerCommand('tree.open', () =>
    onPicked((path, isDir) => {
      if (isDir) void toggleDir(path);
      else void openFileAt(path).then(focusEditor);
    }),
  );
  registerCommand('tree.rename', () => onPicked((path) => treeOps.rename(path)));
  registerCommand('tree.delete', () => onPicked((path, isDir) => treeOps.remove(path, isDir)));
  registerCommand('tree.copy', () => onPicked((path) => treeOps.copy(path, false)));
  registerCommand('tree.cut', () => onPicked((path) => treeOps.copy(path, true)));
  registerCommand('tree.paste', () => onFocused((path, isDir) => void treeOps.pasteInto(path, isDir)));
  registerCommand('tree.copyPath', () => onPicked((path) => void treeOps.copyAbsolutePath(path)));
  registerCommand('tree.reveal', () => onPicked((path) => void treeOps.revealInOs(path)));
  registerCommand('tree.follow', () => void toggleFollow());
  registerCommand('panel.terminal', () => {
    terminalPanelVisible.value = !terminalPanelVisible.value;
  });
  registerCommand('terminal.create', () => createTerminal());
  registerCommand('terminal.shell', () => tools.open('shell'));
  registerCommand('tools.packageManager', () => tools.open('manager'));

  registerCommand('projects.show', () => projects.toggle());
  registerCommand('projects.next', () => projects.moveSuggestion(1));
  registerCommand('projects.prev', () => projects.moveSuggestion(-1));
  registerCommand('projects.suggest', () => projects.openSuggest());
  registerCommand('projects.complete', () => projects.complete());
  registerCommand('projects.accept', () => projects.accept());
  registerCommand('projects.close', () => {
    if (projects.suggestOpen.peek()) projects.closeSuggest();
    else projects.hide();
  });

  registerCommand('git.branches', () => branchesWindow.show());
  registerCommand('git.push', () => void pushWindow.show());
  registerCommand('git.fetch', () => void branchesWindow.do('fetch'));
  registerCommand('pick.next', () => (symbolList.value ? stepSymbol(1) : activePick.value?.next()));
  registerCommand('pick.prev', () => (symbolList.value ? stepSymbol(-1) : activePick.value?.prev()));
  registerCommand('pick.accept', () => (symbolList.value ? acceptSymbol() : activePick.value?.accept()));
  registerCommand('pick.expand', () => activePick.value?.expand?.());

  registerCommand('prompt.confirm', () => void prompt.answer());

  registerCommand('menu.next', () => activeMenu.value?.next());
  registerCommand('menu.prev', () => activeMenu.value?.prev());
  registerCommand('menu.accept', () => activeMenu.value?.accept());

  registerCommand('popup.close', () => {
    closeTop();
  });

  registerCommand('search.everywhere', () => openSearch());
  registerCommand('search.next', () => moveSelection(1));
  registerCommand('search.prev', () => moveSelection(-1));
  registerCommand('search.accept', () => acceptSelected());
  registerCommand('search.close', () => closeSearch());
}

export { missingCommands };

function onFocused(run: (path: string, isDir: boolean) => void): void {
  const path = tree.focus.value ?? '';
  const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
  const entry = dirChildren.value.get(parent)?.find((item) => item.path === path);
  run(path, path === '' ? true : entry?.kind === 'dir');
}

function onPicked(run: (path: string, isDir: boolean) => void): void {
  const path = tree.focus.value;
  if (!path) return;
  onFocused(run);
}

export { resolveContext };
