import { divergedFrom, openFile, reloadDoc } from '../state/session.js';
import { mergeFromDisk } from '../state/merge.js';
import { t } from '../i18n/index.js';

export function DivergedBadge() {
  const file = openFile.value;
  const why = divergedFrom(file?.path ?? null);
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
        onClick={() => void mergeFromDisk(file.path)}
      >
        {why === 'removed' ? t('diverged.sort') : t('diverged.reload')}
      </button>
      {why === 'changed' && (
        <button
          type="button"
          class="diverged-button is-quiet"
          title={t('diverged.discard.hint')}
          onClick={() => void reloadDoc()}
        >
          {t('diverged.discard')}
        </button>
      )}
    </div>
  );
}
