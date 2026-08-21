import { signal } from '@preact/signals';
import type { EditorView } from '@codemirror/view';

export const activeEditor = signal<EditorView | null>(null);

export function editorHasFocus(): boolean {
  return activeEditor.value?.hasFocus ?? false;
}
