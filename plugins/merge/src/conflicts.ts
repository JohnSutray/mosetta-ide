import type { Logger, ProjectMemory } from '@ide/api/server';
import type { MergeSessions } from './sessions.js';
import type { MergeFile, MergeSession } from './types.js';

export class FsConflicts {
  private readonly off: () => void;

  constructor(
    private readonly memory: ProjectMemory,
    private readonly merge: MergeSessions,
    log: Logger,
  ) {
    this.off = memory.on((event) => {
      if (event.type !== 'doc.saveBlocked') return;
      void this.openFor(event.path, 'save').catch((err) => {
        log.warn(`конфликт ${event.path} не собрался: ${String(err)}`);
      });
    });
  }

  forReload(path: string): Promise<MergeSession | null> {
    return this.openFor(path, 'reload');
  }

  dispose(): void {
    this.off();
  }

  private async openFor(path: string, why: 'save' | 'reload'): Promise<MergeSession | null> {
    const doc = this.memory.docSync(path);
    if (!doc) return this.merge.state();

    const disk = await this.memory.disk(path);

    const file: MergeFile = {
      path,
      base: doc.savedText ?? null,
      left: { label: 'merge.side.editor', text: doc.text },
      right: { label: 'merge.side.disk', text: disk ? disk.text : null },
      done: false,
    };

    this.merge.open({
      source: 'fs',
      title: why === 'save' ? 'merge.title.fs.save' : 'merge.title.fs.reload',
      files: [file],
      apply: (target, text) => (why === 'save' ? this.memory.settle(target, text) : this.memory.adopt(target, text)),
    });
    return this.merge.state();
  }
}
