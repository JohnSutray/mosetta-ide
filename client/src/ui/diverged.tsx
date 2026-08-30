import { doc } from '../state/session.js';
import { merge } from '../state/merge.js';
import { t } from '../i18n/index.js';

export function DivergedBadge() {
  const file = doc.open.value;
  const why = doc.divergedFrom(file?.path ?? null);
  if (!file || !why) return null;

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
        onClick={() => void merge.fromDisk(file.path)}
      >
        {why === 'removed' ? t('diverged.sort') : t('diverged.reload')}
      </button>
      {why === 'changed' && (
        <button
          type="button"
          class="diverged-button is-quiet"
          title={t('diverged.discard.hint')}
          onClick={() => void doc.reload()}
        >
          {t('diverged.discard')}
        </button>
      )}
    </div>
  );
}
