import type { Logger, ProjectMemory } from '@mosetta/ide-api/server';
import type { MergeSessions } from './sessions.js';
import type { MergeFile, MergeSession } from './types.js';

/**
 * The supplier of filesystem conflicts.
 *
 * It stands on BORROWED memory: it takes its texts from it and from disk
 * (`memory.disk`), and hands the result over with two verbs — `settle` (onto disk) and
 * `adopt` (into memory). A conflict is started ONLY by an action being refused: memory
 * diverging from disk is not an argument in itself.
 *
 * There are exactly two actions that can run into it, and they differ not in the
 * argument's content but in WHERE the result goes:
 *
 * * a save — the result goes to DISK (the human asked for it to be written)
 * * a reload — the result goes into MEMORY (the human asked to pull somebody else's in)
 */
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
        log.warn(`the conflict ${event.path} did not assemble: ${String(err)}`);
      });
    });
  }

  /** Pull disk in without throwing our own away. The result will land in memory. */
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
