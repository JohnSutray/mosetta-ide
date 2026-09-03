import { doc } from '../state/session.js';
import { i18n } from '../i18n/index.js';
import { complain } from '../state/notifications.js';

export function DivergedBadge() {
  const file = doc.open.value;
  const why = doc.divergedFrom(file?.path ?? null);
  if (!file || !why) return null;

  return (
    <div class="diverged">
      <span class="diverged-sign">⚠</span>
      <span class="diverged-text">
        {why === 'removed' ? i18n.t('diverged.removed') : i18n.t('diverged.changed')}
      </span>
      <button
        type="button"
        class="diverged-button"
        title={i18n.t('diverged.merge.hint')}
        onClick={() => void doc.mergeFromDisk(file.path).catch((err) => complain(String(err)))}
      >
        {why === 'removed' ? i18n.t('diverged.sort') : i18n.t('diverged.reload')}
      </button>
      {why === 'changed' && (
        <button
          type="button"
          class="diverged-button is-quiet"
          title={i18n.t('diverged.discard.hint')}
          onClick={() => void doc.reload()}
        >
          {i18n.t('diverged.discard')}
        </button>
      )}
    </div>
  );
}
