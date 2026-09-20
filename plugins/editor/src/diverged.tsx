import { useT } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import DocPlugin from '@mosetta/ide-plugin-doc';
import MergePlugin from '@mosetta/ide-plugin-merge';

/**
 * The "this file has diverged from disk" strip.
 *
 * A divergence is a FACT about one file rather than an accident or a queue of things to
 * do. So it lives where the file does: in its top right corner, and it hangs there
 * until it is settled. A notification in the corner of the screen would not do for this
 * — it flew away after a minute while the divergence remained.
 *
 * It used to live in the core, in the editor panel's header, and vanished along with
 * the panel when the editor became a plugin: the document layer saw the divergence and
 * had nobody to tell. Now the strip is drawn by whoever draws the file.
 *
 * The triangle is yellow rather than red: nothing is broken and no work is lost. Red
 * here would be a shout where a report is all that is needed.
 */
export function DivergedBadge({ path, ide }: { path: string; ide: Ide }) {
  const t = useT();
  const docs = ide.getPlugin(DocPlugin);
  const why = docs.diverged.value.get(path);
  if (!why) return null;

  const say = (err: unknown) => ide.complain(err instanceof Error ? err.message : String(err));
  return (
    <div class="diverged">
      <span class="diverged-sign">⚠</span>
      <span class="diverged-text">
        {why === 'removed' ? t('docs.diverged.removed') : t('docs.diverged.changed')}
      </span>
      <button
        type="button"
        class="diverged-button"
        title={t('docs.diverged.merge.hint')}
        onClick={() => void ide.getPlugin(MergePlugin).fromDisk(path).catch(say)}
      >
        {why === 'removed' ? t('docs.diverged.sort') : t('docs.diverged.reload')}
      </button>
      {why === 'changed' && (
        <button
          type="button"
          class="diverged-button is-quiet"
          title={t('docs.diverged.discard.hint')}
          onClick={() => void docs.reloadFile().catch(say)}
        >
          {t('docs.diverged.discard')}
        </button>
      )}
    </div>
  );
}
