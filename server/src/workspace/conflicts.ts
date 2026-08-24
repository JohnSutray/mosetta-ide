import type { MergeFile } from '@ide/protocol';
import type { OsFs } from '../fs/os-fs.js';
import type { RamFs } from '../fs/ram-fs.js';
import type { MergeSessions } from '../merge/sessions.js';
import type { Logger } from '../log.js';

export function watchFsConflicts(
  ram: RamFs,
  os: OsFs,
  merge: MergeSessions,
  log: Logger,
): () => void {
  return ram.on((event) => {
    if (event.type !== 'doc.conflict') return;
    void declare(event.path, event.reason).catch((err) => {
      log.warn(`конфликт ${event.path} не собрался: ${String(err)}`);
    });
  });

  async function declare(path: string, reason: 'changed' | 'removed'): Promise<void> {
    const doc = ram.docSync(path);
    if (!doc) return;

    const file: MergeFile = {
      path,
      base: doc.savedText ?? null,
      left: { label: 'merge.side.editor', text: doc.text },
      right:
        reason === 'removed'
          ? { label: 'merge.side.disk', text: null }
          : { label: 'merge.side.disk', text: (await os.read(path)).text },
      done: false,
    };

    merge.open({
      source: 'fs',
      title: 'merge.title.fs',
      files: [file],
      apply: (target, text) => ram.resolveDoc(target, text),
    });
  }
}
