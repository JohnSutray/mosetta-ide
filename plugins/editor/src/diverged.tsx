import { t } from '@ide/api/client';
import { diverged, reloadFile } from '@ide/plugin-doc';
import { mergeFromDisk } from '@ide/plugin-merge';
import type { Ide } from '@ide/api/client';

export function DivergedBadge({ path, ide }: { path: string; ide: Ide }) {
  const why = diverged.value.get(path);
  if (!why) return null;

  const say = (err: unknown) => ide.complain(err instanceof Error ? err.message : String(err));
  return (
    <div class="diverged">
      <span class="diverged-sign">⚠</span>
      <span class="diverged-text">
        {why === 'removed' ? t('diverged.removed') : t('diverged.changed')}
      </span>
      <button
        type="button"
        class="diverged-button"
        title={t('diverged.merge.hint')}
        onClick={() => void mergeFromDisk(path).catch(say)}
      >
        {why === 'removed' ? t('diverged.sort') : t('diverged.reload')}
      </button>
      {why === 'changed' && (
        <button
          type="button"
          class="diverged-button is-quiet"
          title={t('diverged.discard.hint')}
          onClick={() => void reloadFile().catch(say)}
        >
          {t('diverged.discard')}
        </button>
      )}
    </div>
  );
}
