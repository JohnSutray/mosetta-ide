import { redo, undo } from '@codemirror/commands';
import { registerCommand, missingCommands } from './keys/commands.js';
import { resolveContext } from './keys/context.js';
import { acceptSelected, closeSearch, moveSelection, openSearch } from './state/search.js';
import { activeEditor, focusEditor } from './state/editor.js';
import { closeTop } from './state/popups.js';
import { activePick } from './state/pick.js';
import { toggleScripts } from './state/scripts.js';
import {
  askCreate,
  askRemove,
  askRename,
  copyAbsolutePath,
  copyToClipboard,
  promptAnswer,
  revealInOs,
  pasteInto,
  treeFocus,
} from './state/tree-ops.js';
import { dirChildren, openFileAt, toggleDir } from './state/session.js';
import {
  problemsPanelVisible,
  reloadDoc,
  saveDoc,
  terminalPanelVisible,
  treePanelVisible,
} from './state/session.js';
import { createTerminal } from './state/terminals.js';
import { gitDo, openBranches, openPush } from './state/git.js';
import {
  acceptPath,
  completeSuggestion,
  hideProjects,
  moveSuggestion,
  openSuggest,
  toggleProjects,
  closeSuggest,
  suggestOpen,
} from './state/projects.js';

export function registerCommands(): void {
  registerCommand('file.save', () => saveDoc());
  registerCommand('file.reload', () => reloadDoc());

  registerCommand('edit.undo', () => {
    const view = activeEditor.value;
    if (view) undo(view);
  });
  registerCommand('edit.redo', () => {
    const view = activeEditor.value;
    if (view) redo(view);
  });

  registerCommand('panel.tree', () => {
    treePanelVisible.value = !treePanelVisible.value;
  });
  registerCommand('panel.problems', () => {
    problemsPanelVisible.value = !problemsPanelVisible.value;
  });

  registerCommand('scripts.open', () => toggleScripts());

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
  registerCommand('panel.terminal', () => {
    terminalPanelVisible.value = !terminalPanelVisible.value;
  });
  registerCommand('terminal.create', () => createTerminal());

  registerCommand('projects.show', () => toggleProjects());
  registerCommand('projects.next', () => moveSuggestion(1));
  registerCommand('projects.prev', () => moveSuggestion(-1));
  registerCommand('projects.suggest', () => openSuggest());
  registerCommand('projects.complete', () => completeSuggestion());
  registerCommand('projects.accept', () => acceptPath());
  registerCommand('projects.close', () => {
    if (suggestOpen.peek()) closeSuggest();
    else hideProjects();
  });

  registerCommand('git.branches', () => openBranches());
  registerCommand('git.push', () => void openPush());
  registerCommand('git.fetch', () => void gitDo('fetch'));
  registerCommand('pick.next', () => activePick.value?.next());
  registerCommand('pick.prev', () => activePick.value?.prev());
  registerCommand('pick.accept', () => activePick.value?.accept());
  registerCommand('pick.expand', () => activePick.value?.expand?.());

  registerCommand('prompt.confirm', () => void promptAnswer());

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
