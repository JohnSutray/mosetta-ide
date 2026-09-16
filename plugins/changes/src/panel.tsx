import { useT } from '@mosetta/ide-api/client';
import { FileIcon } from '@mosetta/ide-plugin-ui';
import type { ChangeRow, Changes } from './state.js';

export function ChangesPanel({ changes, onOpen }: { changes: Changes; onOpen: (path: string) => void }) {
  const t = useT();
  const rows = changes.rows.value;
  const picked = changes.picked.value.length;
  const shelf = changes.shelf.value;

  return (
    <div class="chg" data-keys="changes">
      <div class="chg-head">
        <label class="chg-all">
          <input
            type="checkbox"
            checked={rows.length > 0 && picked === rows.length}
            disabled={rows.length === 0}
            onChange={() => changes.toggleAll()}
          />
          <span>{t('changes.picked', { picked, total: rows.length })}</span>
        </label>
      </div>

      <div class="chg-list">
        {rows.length === 0 && <div class="chg-empty">{t('changes.clean')}</div>}
        {rows.map((row) => (
          <Row key={row.path} row={row} changes={changes} onOpen={onOpen} />
        ))}
      </div>

      <div class="chg-commit">
        <textarea
          class="chg-message"
          rows={3}
          spellcheck={false}
          placeholder={t('changes.message')}
          value={changes.message.value}
          onInput={(event) => (changes.message.value = (event.target as HTMLTextAreaElement).value)}
        />
        {changes.error.value !== '' && <div class="chg-error">{changes.error.value}</div>}
        <div class="chg-buttons">
          <label class="chg-amend">
            <input
              type="checkbox"
              checked={changes.amend.value}
              onChange={() => (changes.amend.value = !changes.amend.value)}
            />
            <span>{t('changes.amend')}</span>
          </label>
          <button
            type="button"
            class="chg-do"
            disabled={!changes.canCommit.value}
            onClick={() => void changes.commit()}
          >
            {t('changes.commit')}
          </button>
          <button
            type="button"
            class="chg-shelve"
            disabled={changes.busy.value || picked === 0}
            onClick={() => void changes.shelve()}
          >
            {t('changes.shelve')}
          </button>
        </div>
      </div>

      <div class="chg-shelf">
        <div class="chg-section">{t('changes.shelf', { count: shelf.length })}</div>
        {shelf.length === 0 && <div class="chg-empty">{t('changes.shelfEmpty')}</div>}
        {shelf.map((item) => (
          <div class="chg-shelf-row" key={item.id}>
            <span class="chg-shelf-name" title={item.files.join('\n')}>
              {item.name}
            </span>
            <span class="chg-shelf-when">{when(item.at)}</span>
            <button type="button" class="chg-shelf-take" onClick={() => void changes.unshelve(item.id)}>
              {t('changes.unshelve')}
            </button>
            <button type="button" class="chg-shelf-drop" onClick={() => void changes.drop(item.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ row, changes, onOpen }: { row: ChangeRow; changes: Changes; onOpen: (path: string) => void }) {
  const name = row.path.split('/').pop() ?? row.path;
  const folder = row.path.slice(0, row.path.length - name.length).replace(/\/$/, '');
  return (
    <div class={`chg-row is-${row.state}`}>
      <input type="checkbox" checked={row.picked} onChange={() => changes.toggleFile(row.path)} />
      <span class="chg-icon">
        <FileIcon name={name} />
      </span>
      <button type="button" class="chg-name" onClick={() => onOpen(row.path)} title={row.path}>
        {name}
      </button>
      <span class="chg-folder">{folder}</span>
    </div>
  );
}

function when(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const today = new Date();
  const sameDay =
    at.getFullYear() === today.getFullYear() && at.getMonth() === today.getMonth() && at.getDate() === today.getDate();
  const two = (value: number) => String(value).padStart(2, '0');
  return sameDay
    ? `${two(at.getHours())}:${two(at.getMinutes())}`
    : `${two(at.getDate())}.${two(at.getMonth() + 1)}`;
}
