import { notifications } from '../state/notifications.js';
import { i18n } from '../i18n/index.js';

export function Notifications() {
  const list = notifications.notes.value;
  if (list.length === 0) return null;

  return (
    <div class="notifications.notes">
      {list.length > 1 && (
        <div class="notes-all" onClick={notifications.dismissAll}>
          {i18n.t('note.closeAll')}
        </div>
      )}
      {list.map((note) => (
        <div key={note.id} class={`note is-${note.kind}`}>
          {note.kind === 'work' && <span class="spinner" />}
          <span class="note-text">{note.text}</span>
          <span class="note-close" title={i18n.t('note.close')} onClick={() => notifications.dismiss(note.id)}>
            ×
          </span>
        </div>
      ))}
    </div>
  );
}
