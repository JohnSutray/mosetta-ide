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
import {
  problemsPanelVisible,
  reloadDoc,
  saveDoc,
  scriptsPanelVisible,
  terminalPanelVisible,
  treePanelVisible,
} from './state/session.js';
import { createTerminal } from './state/terminals.js';
import {
  branchesOpen,
  branchPrompt,
  closeBranches,
  gitDo,
  moveBranch,
  openBranches,
} from './state/git.js';
import {
  acceptPath,
  completeSuggestion,
  hideProjects,
  moveSuggestion,
  projectsVisible,
  showProjects,
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

  registerCommand('panel.scripts', () => {
    scriptsPanelVisible.value = !scriptsPanelVisible.value;
  });
  registerCommand('panel.terminal', () => {
    terminalPanelVisible.value = !terminalPanelVisible.value;
  });
  registerCommand('terminal.create', () => createTerminal());

  registerCommand('projects.show', () => showProjects());
  registerCommand('projects.next', () => moveSuggestion(1));
  registerCommand('projects.prev', () => moveSuggestion(-1));
  registerCommand('projects.complete', () => completeSuggestion());
  registerCommand('projects.accept', () => acceptPath());
  registerCommand('projects.close', () => hideProjects());

  registerCommand('git.branches', () => openBranches());
  registerCommand('git.next', () => moveBranch(1));
  registerCommand('git.prev', () => moveBranch(-1));
  registerCommand('git.checkout', () => void gitDo('checkout'));
  registerCommand('git.close', () => closeBranches());

  registerCommand('search.everywhere', () => openSearch());
  registerCommand('search.next', () => moveSelection(1));
  registerCommand('search.prev', () => moveSelection(-1));
  registerCommand('search.accept', () => acceptSelected());
  registerCommand('search.close', () => closeSearch());
}

export { missingCommands };

export function resolveContext(): KeyContext {
  if (searchOpen.value) return 'search';
  if (branchesOpen.value && !branchPrompt.value) return 'branches';
  if (editorHasFocus()) return 'editor';
  const active = document.activeElement;
  if (projectsVisible.value && active?.closest('.projects')) return 'projects';
  if (active?.closest('.column-tree')) return 'tree';
  return 'global';
}
