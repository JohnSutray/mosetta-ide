import type { DirEntry, TreeWire } from '@mosetta/ide-api/client';
import { signal } from '@preact/signals';

/**
 * The tree's memory: what a directory holds, and what is expanded.
 *
 * It used to live in the core as a "memory layer" — but a layer it was not: it is a
 * cache of the `tree.list` answer plus two sets of "what is expanded", i.e. the state
 * of a VIEW, and only this one plugin read it. The core hands over the wire
 * (`tree.list`, `tree.onChanged`), and remembering is our job.
 *
 * A counterpart to the selection: here is what to show, there is what of what is shown
 * is selected. They are split by lifetime: the contents outlive a change of selection
 * and are reset along with the project.
 */
export class FileTree {
  readonly children = signal<Map<string, DirEntry[]>>(new Map());
  readonly expanded = signal<Set<string>>(new Set());
  /**
   * Whether the root is expanded. Apart from `expanded`, because the root is expanded
   * TO BEGIN WITH: an empty set means "nothing was touched" rather than "everything is
   * closed".
   */
  readonly rootExpanded = signal(true);

  constructor(
    private readonly wire: TreeWire,
    private readonly complain: (message: string) => void,
  ) {}

  async load(path: string): Promise<void> {
    const entries = await this.wire.list(path);
    const next = new Map(this.children.value);
    next.set(path, entries);
    this.children.value = next;
  }

  /** Expand a directory if it is collapsed. A new file has to be visible. */
  async ensureExpanded(path: string): Promise<void> {
    if (path === '' || this.expanded.value.has(path)) return;
    await this.toggle(path);
  }

  async toggle(path: string): Promise<void> {
    const next = new Set(this.expanded.value);
    if (next.has(path)) {
      next.delete(path);
      this.expanded.value = next;
      return;
    }
    next.add(path);
    this.expanded.value = next;
    if (!this.children.value.has(path)) {
      try {
        await this.load(path);
      } catch (err) {
        this.complain(err instanceof Error ? err.message : String(err));
      }
    }
  }

  /**
   * A directory updated on the server — we re-read exactly the one we have read. This
   * is the visible part of the watcher: a file created past the editor appears by
   * itself.
   */
  refresh(path: string): void {
    if (!this.children.value.has(path)) return;
    void this.load(path).catch(() => {});
  }

  /**
   * The project changed. We reset rather than refresh: otherwise the new project's tree
   * would keep the old one's expanded directories.
   */
  reset(): void {
    this.children.value = new Map();
    this.expanded.value = new Set();
    this.rootExpanded.value = true;
  }
}
