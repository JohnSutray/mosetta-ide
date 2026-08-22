import { signal } from '@preact/signals';
import type { Hunk } from '../editor/line-diff.js';
import { activeEditor } from './editor.js';
import { revertHunk } from '../editor/git-marks.js';
import { rpc } from './session.js';

export const hunkPopup = signal<{ hunk: Hunk; x: number; y: number } | null>(null);

export const headText = signal<string | null>(null);

export function showHunk(hunk: Hunk, at: { x: number; y: number }): void {
  hunkPopup.value = { hunk, ...at };
}

export function closeHunk(): void {
  hunkPopup.value = null;
}

export function revertOpenHunk(): void {
  const open = hunkPopup.value;
  const view = activeEditor.value;
  hunkPopup.value = null;
  if (!open || !view) return;
  revertHunk(view, open.hunk);
  view.focus();
}

export async function loadHead(path: string | null): Promise<void> {
  if (!path) {
    headText.value = null;
    return;
  }
  try {
    const head = await rpc.call('git.head', { path });
    if (head.path === path) headText.value = head.text;
  } catch (err) {
    headText.value = null;
    void err;
  }
}
