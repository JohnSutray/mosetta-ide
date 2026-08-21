import { dismiss, dismissAll, notes } from '../state/notifications.js';
import { t } from '../i18n/index.js';

export function Notifications() {
  const list = notes.value;
  if (list.length === 0) return null;

  return (
    <div class="notes">
      {list.length > 1 && (
        <div class="notes-all" onClick={dismissAll}>
          {t('note.closeAll')}
        </div>
      )}
      {list.map((note) => (
        <div key={note.id} class={`note is-${note.kind}`}>
          {note.kind === 'work' && <span class="spinner" />}
          <span class="note-text">{note.text}</span>
          <span class="note-close" title={t('note.close')} onClick={() => dismiss(note.id)}>
            ×
          </span>
        </div>
      ))}
    </div>
  );
}
