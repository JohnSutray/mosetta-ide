import type { MergeSession, MergeSupply } from './types.js';

/**
 * Merge sessions.
 *
 * There is not one layer here, and that is the module's main property: a session holds
 * the triples of text and the supplier's telephone number. Where the texts came from
 * and what to do with the result is known to the SUPPLIER. It used to live in the core;
 * the supplier of disk conflicts sits next door, on borrowed memory.
 */

interface Live extends MergeSupply {
  id: string;
}

export class MergeSessions {
  private readonly queue: Live[] = [];
  private readonly listeners = new Set<(state: MergeSession | null) => void>();
  private counter = 0;

  on(listener: (state: MergeSession | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Declare a conflict.
   *
   * Files from ONE supplier merge into one session: while the human was settling the
   * first file, a second could have diverged on disk. Different suppliers queue up:
   * there is one screen for all of them.
   */
  open(supply: MergeSupply): void {
    const existing = this.queue.find((item) => item.source === supply.source);
    if (existing) {
      for (const file of supply.files) {
        const at = existing.files.findIndex((item) => item.path === file.path);
        if (at === -1) existing.files.push(file);
        else existing.files[at] = file;
      }
      existing.apply = supply.apply;
      existing.finish = supply.finish;
      existing.cancel = supply.cancel;
      this.announce();
      return;
    }
    this.counter += 1;
    this.queue.push({ ...supply, id: `merge-${this.counter}` });
    this.announce();
  }

  /** The session currently on screen. */
  state(): MergeSession | null {
    const live = this.queue[0];
    if (!live) return null;
    return { id: live.id, source: live.source, title: live.title, files: live.files };
  }

  async resolve(path: string, text: string | null): Promise<MergeSession | null> {
    const live = this.queue[0];
    if (!live) throw new Error('there are no conflicts');
    const file = live.files.find((item) => item.path === path);
    if (!file) throw new Error(`not in this session: ${path}`);

    await live.apply(path, text);
    file.done = true;

    if (live.files.every((item) => item.done)) {
      this.queue.shift();
      try {
        await live.finish?.();
      } finally {
        this.announce();
      }
      return this.state();
    }
    this.announce();
    return this.state();
  }

  async cancel(): Promise<void> {
    const live = this.queue.shift();
    this.announce();
    await live?.cancel?.();
  }

  /** The project is closing. We do not call the suppliers: they are already gone. */
  dispose(): void {
    this.queue.length = 0;
    this.listeners.clear();
  }

  private announce(): void {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }
}
