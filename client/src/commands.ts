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
import {
  decideHere,
  resolveMerge,
  stepMergeConflict,
  stepMergeFile,
  toggleMerge,
} from './state/merge.js';
import { goBack, goForward } from './state/visits.js';
import { accept as acceptSymbol, step as stepSymbol, symbolList } from './state/symbols.js';
import {
  askCreate,
  askRemove,
  askRename,
  closeTreeBranch,
  openTreeBranch,
  stepTree,
  copyAbsolutePath,
  copyToClipboard,
  promptAnswer,
  revealInOs,
  pasteInto,
  treeFocus,
} from './state/tree-ops.js';
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

  registerCommand('merge.show', () => toggleMerge());
  registerCommand('merge.nextFile', () => stepMergeFile(1));
  registerCommand('merge.prevFile', () => stepMergeFile(-1));
  registerCommand('merge.next', () => stepMergeConflict(1));
  registerCommand('merge.prev', () => stepMergeConflict(-1));
  registerCommand('merge.takeLeft', () => decideHere('left', 'take'));
  registerCommand('merge.takeRight', () => decideHere('right', 'take'));
  registerCommand('merge.skipLeft', () => decideHere('left', 'skip'));
  registerCommand('merge.skipRight', () => decideHere('right', 'skip'));
  registerCommand('merge.confirm', () => void resolveMerge());

  registerCommand('panel.tree', () => {
    treePanelVisible.value = !treePanelVisible.value;
  });

  registerCommand('tree.next', () => stepTree(1));
  registerCommand('tree.prev', () => stepTree(-1));
  registerCommand('tree.expand', () => openTreeBranch());
  registerCommand('tree.collapse', () => closeTreeBranch());
  registerCommand('tree.newFile', () => onFocused((path, isDir) => askCreate(path, isDir, 'file')));
  registerCommand('tree.newFolder', () => onFocused((path, isDir) => askCreate(path, isDir, 'dir')));
  registerCommand('tree.open', () =>
    onPicked((path, isDir) => {
      if (isDir) void toggleDir(path);
      else void openFileAt(path).then(focusEditor);
    }),
  );
  registerCommand('tree.rename', () => onPicked((path) => askRename(path)));
  registerCommand('tree.delete', () => onPicked((path, isDir) => askRemove(path, isDir)));
  registerCommand('tree.copy', () => onPicked((path) => copyToClipboard(path, false)));
  registerCommand('tree.cut', () => onPicked((path) => copyToClipboard(path, true)));
  registerCommand('tree.paste', () => onFocused((path, isDir) => void pasteInto(path, isDir)));
  registerCommand('tree.copyPath', () => onPicked((path) => void copyAbsolutePath(path)));
  registerCommand('tree.reveal', () => onPicked((path) => void revealInOs(path)));
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

  registerCommand('prompt.confirm', () => void promptAnswer());

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
  const path = treeFocus.value ?? '';
  const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
  const entry = dirChildren.value.get(parent)?.find((item) => item.path === path);
  run(path, path === '' ? true : entry?.kind === 'dir');
}

function onPicked(run: (path: string, isDir: boolean) => void): void {
  const path = treeFocus.value;
  if (!path) return;
  onFocused(run);
}

export { resolveContext };
