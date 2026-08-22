import { signal } from '@preact/signals';
import type { EditorView } from '@codemirror/view';

export const activeEditor = signal<EditorView | null>(null);

export function editorHasFocus(): boolean {
  return activeEditor.value?.hasFocus ?? false;
}

let focusOnMount = true;

export function openWithoutFocus(): void {
  focusOnMount = false;
}

export function focusEditor(): void {
  activeEditor.value?.focus();
}

export function takeFocusOnMount(): boolean {
  const wanted = focusOnMount;
  focusOnMount = true;
  return wanted;
}
