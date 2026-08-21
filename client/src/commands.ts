import { redo, undo } from '@codemirror/commands';
import type { KeyContext } from '@ide/protocol';
import { registerCommand, missingCommands } from './keys/commands.js';
import { activeEditor, editorHasFocus } from './state/editor.js';
import {
  problemsPanelVisible,
  reloadDoc,
  saveDoc,
  treePanelVisible,
} from './state/session.js';

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
}

export { missingCommands };

export function resolveContext(): KeyContext {
  if (editorHasFocus()) return 'editor';
  const active = document.activeElement;
  if (active?.closest('.column-tree')) return 'tree';
  return 'global';
}
