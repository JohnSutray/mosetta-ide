import type { MergeFile, MergeSession } from '@ide/protocol';
import type { OsFs } from '../fs/os-fs.js';
import type { RamFs } from '../fs/ram-fs.js';
import type { MergeSessions } from '../merge/sessions.js';
import type { Logger } from '../log.js';

export interface FsConflicts {
  off(): void;
  forReload(path: string): Promise<MergeSession | null>;
}

export class Conflicts {
  watch(
    ram: RamFs,
    os: OsFs,
    merge: MergeSessions,
    log: Logger,
  ): FsConflicts {
    const off = ram.on((event) => {
      if (event.type !== 'doc.saveBlocked') return;
      void openFor(event.path, 'save').catch((err) => {
        log.warn(`конфликт ${event.path} не собрался: ${String(err)}`);
      });
    });

    return {
      off,
      forReload: (path) => openFor(path, 'reload'),
    };

    async function openFor(path: string, why: 'save' | 'reload'): Promise<MergeSession | null> {
      const doc = ram.docSync(path);
      if (!doc) return merge.state();

      const stat = await os.stat(path);
      const disk = stat && stat.kind === 'file' ? await os.read(path) : null;

      const file: MergeFile = {
        path,
        base: doc.savedText ?? null,
        left: { label: 'merge.side.editor', text: doc.text },
        right: { label: 'merge.side.disk', text: disk ? disk.text : null },
        done: false,
      };

      merge.open({
        source: 'fs',
        title: why === 'save' ? 'merge.title.fs.save' : 'merge.title.fs.reload',
        files: [file],
        apply: (target, text) =>
          why === 'save' ? ram.resolveDoc(target, text) : ram.adoptDoc(target, text),
      });
      return merge.state();
    }
  }
}

export const conflicts = new Conflicts();
