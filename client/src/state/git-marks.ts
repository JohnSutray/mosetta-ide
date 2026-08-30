import { doc, rpc } from './session.js';
import { signal } from '@preact/signals';
import { lineDiff, type Hunk } from '../editor/line-diff.js';
import type { HunkBox } from '@ide/api/client';

export class GitMarks {
  readonly popup = signal<{ hunk: Hunk; box: HunkBox } | null>(null);

  readonly head = signal<{ path: string; text: string | null } | null>(null);

  headFor(path: string | null): string | null {
    const known = this.head.value;
    return known && known.path === path ? known.text : null;
  }

  show(hunk: Hunk, box: HunkBox): void {
    this.popup.value = { hunk, box };
  }

  close(): void {
    this.popup.value = null;
  }

  revertOpen(): void {
    const open = this.popup.value;
    const file = doc.open.peek();
    this.popup.value = null;
    if (!open || !file) return;
    doc.replaceText(lineDiff.reverted(file.text, open.hunk));
  }

  async load(path: string | null): Promise<void> {
    if (!path) {
      this.head.value = null;
      return;
    }
    try {
      const head = await rpc.call('git.head', { path });
      if (head.path === path) this.head.value = { path, text: head.text };
    } catch {
      this.head.value = null;
    }
  }
}

export const gitMarks = new GitMarks();
