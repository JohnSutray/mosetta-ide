import type { MergeSession, MergeSupply } from './types.js';

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

  state(): MergeSession | null {
    const live = this.queue[0];
    if (!live) return null;
    return { id: live.id, source: live.source, title: live.title, files: live.files };
  }

  async resolve(path: string, text: string | null): Promise<MergeSession | null> {
    const live = this.queue[0];
    if (!live) throw new Error('конфликтов нет');
    const file = live.files.find((item) => item.path === path);
    if (!file) throw new Error(`не в этом сеансе: ${path}`);

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

  dispose(): void {
    this.queue.length = 0;
    this.listeners.clear();
  }

  private announce(): void {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }
}
