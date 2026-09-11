import type { DirEntry, TreeWire } from '@mosetta/ide-api/client';
import { signal } from '@preact/signals';

export class FileTree {
  readonly children = signal<Map<string, DirEntry[]>>(new Map());
  readonly expanded = signal<Set<string>>(new Set());
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

  refresh(path: string): void {
    if (!this.children.value.has(path)) return;
    void this.load(path).catch(() => {});
  }

  reset(): void {
    this.children.value = new Map();
    this.expanded.value = new Set();
    this.rootExpanded.value = true;
  }
}
