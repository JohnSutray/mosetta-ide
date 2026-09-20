import { signal } from '@preact/signals';
import { type HunkBox } from '@mosetta/ide-api/client';
import type { Hunk } from '@mosetta/ide-plugin-code';
import type DocPlugin from '@mosetta/ide-plugin-doc';

/**
 * The git strips beside the text, and the "how it was" popup.
 *
 * The popup's position is computed from THE LINES THEMSELVES rather than from the
 * click: it stands below them or above them, but never over. It shows "how it was" —
 * and comparing that with "how it is" is only possible when both are visible. It cannot
 * be a modal in the middle of the screen for the same reason: the conversation is about
 * particular lines, and taking one's eyes away from them means losing the place.
 */
export class GitMarks {
  constructor(private readonly remote: { head(path: string): Promise<{ path: string; text: string | null }> },
    /** Documents are a neighbour: what is open, and how to edit it. */
    private readonly docs: () => Pick<DocPlugin, 'openDoc' | 'replaceText'>,
  ) {}

  readonly popup = signal<{ hunk: Hunk; box: HunkBox } | null>(null);

  /**
   * What this file was IN THE COMMIT.
   *
   * The path travels with the text, and that is not decoration. The git strips are
   * computed by comparing with that text, while opening a file and git's answer are two
   * different events: between them there is time for a frame in which the new file is
   * compared with the OLD answer. It looked like a blue stripe along the whole file for
   * a fraction of a second, on every open.
   *
   * `text: null` inside means "the file is not in the history at all" (new, untracked).
   */
  readonly head = signal<{ path: string; text: string | null } | null>(null);

  /** The answer about THIS file — or nothing, until it has arrived. */
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
    this.docs().replaceText(reverted(file.text, open.hunk));
  }

  /**
   * Take from git what the file was in the commit.
   *
   * Called when a file opens and after every git operation: a commit, a checkout and a
   * pull change the answer, and the strips are obliged to notice — otherwise they show
   * edits that no longer exist.
   */
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

/**
 * The text as it will become if this hunk is reverted.
 *
 * It moved here along with its only reader: reverting is a git action rather than an
 * editor's. Lines are counted from one, as in a hunk; an empty file is ZERO lines
 * rather than one empty one.
 */
function reverted(text: string, hunk: Hunk): string {
  const lines = split(text);
  const restored = hunk.before;
  const tail = text.endsWith('\n') ? '\n' : '';

  if (hunk.kind === 'added') {
    const from = Math.min(hunk.from, lines.length + 1) - 1;
    const to = Math.min(hunk.to, lines.length);
    return [...lines.slice(0, from), ...lines.slice(to)].join('\n') + tail;
  }

  if (hunk.kind === 'modified') {
    const from = Math.min(hunk.from, lines.length) - 1;
    const to = Math.min(hunk.to, lines.length);
    return [...lines.slice(0, from), ...restored, ...lines.slice(to)].join('\n') + tail;
  }

  const at = Math.min(hunk.from, lines.length + 1) - 1;
  return [...lines.slice(0, at), ...restored, ...lines.slice(at)].join('\n') + tail;
}

function split(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
