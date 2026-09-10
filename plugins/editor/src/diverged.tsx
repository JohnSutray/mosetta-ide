import { t } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import DocPlugin from '@ide/plugin-doc';
import MergePlugin from '@ide/plugin-merge';

export function DivergedBadge({ path, ide }: { path: string; ide: Ide }) {
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
