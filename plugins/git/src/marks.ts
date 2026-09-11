import { signal } from '@preact/signals';
import { type HunkBox } from '@mosetta/ide-api/client';
import type { Hunk } from '@mosetta/ide-plugin-code';
import type DocPlugin from '@mosetta/ide-plugin-doc';

export class GitMarks {
  constructor(private readonly remote: { head(path: string): Promise<{ path: string; text: string | null }> },
    private readonly docs: () => Pick<DocPlugin, 'openDoc' | 'editDoc'>,
  ) {}

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
    const file = this.docs().openDoc.value;
    this.popup.value = null;
    if (!open || !file) return;
    this.docs().editDoc(reverted(file.text, open.hunk));
  }

  async load(path: string | null): Promise<void> {
    if (!path) {
      this.head.value = null;
      return;
    }
    try {
      const head = await this.remote.head(path);
      if (head.path === path) this.head.value = { path, text: head.text };
    } catch {
      this.head.value = null;
    }
  }
}

function reverted(text: string, hunk: Hunk): string {
  const lines = split(text);
  const restored = hunk.before;

  if (hunk.kind === 'added') {
    const from = Math.min(hunk.from, lines.length + 1) - 1;
    const to = Math.min(hunk.to, lines.length);
    return [...lines.slice(0, from), ...lines.slice(to)].join('\n');
  }

  if (hunk.kind === 'modified') {
    const from = Math.min(hunk.from, lines.length) - 1;
    const to = Math.min(hunk.to, lines.length);
    return [...lines.slice(0, from), ...restored, ...lines.slice(to)].join('\n');
  }

  const at = Math.min(hunk.from, lines.length + 1) - 1;
  return [...lines.slice(0, at), ...restored, ...lines.slice(at)].join('\n');
}

function split(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
