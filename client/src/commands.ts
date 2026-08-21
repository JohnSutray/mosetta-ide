import { redo, undo } from '@codemirror/commands';
import type { KeyContext } from '@ide/protocol';
import { registerCommand, missingCommands } from './keys/commands.js';
import {
  acceptSelected,
  closeSearch,
  moveSelection,
  openSearch,
  searchOpen,
} from './state/search.js';
import { activeEditor, editorHasFocus } from './state/editor.js';
import { closeTop } from './state/popups.js';
import { activePick } from './state/pick.js';
import { toggleScripts } from './state/scripts.js';
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
  projectsVisible,
  showProjects,
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
  registerCommand('panel.terminal', () => {
    terminalPanelVisible.value = !terminalPanelVisible.value;
  });
  registerCommand('terminal.create', () => createTerminal());

  registerCommand('projects.show', () => showProjects());
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

export function resolveContext(): KeyContext {
  if (searchOpen.value) return 'search';
  if (activePick.value) return 'pick';
  if (editorHasFocus()) return 'editor';
  const active = document.activeElement;
  if (projectsVisible.value && active?.closest('.projects')) return 'projects';
  if (active?.closest('.column-tree')) return 'tree';
  return 'global';
}
