import { useRef, useState } from 'preact/hooks';
import { useT } from '@mosetta/ide-api/client';
import { Chevron, FileIcon, Resizer, type Typeahead } from '@mosetta/ide-plugin-ui';
import { RefreshIcon } from './icon.js';
import type UiPlugin from '@mosetta/ide-plugin-ui';
import type { ShelfItem } from './server.js';
import type { Changelist } from './changelist.js';
import { DEFAULT_LIST, type ChangeGroup, type ChangeRow, type Changes } from './state.js';

/**
 * What is put into a drag.
 *
 * The name is OUR OWN rather than shared with the tree: on a drag like this the tree
 * MOVES files on disk, and a file accidentally dragged out of the list of changes into
 * the tree would travel for real. Different actions — different names.
 */
const DRAG_TYPE = 'application/x-ide-change-paths';

/**
 * The geometry key for the height of the commit block. The store calls this a width —
 * the size along the axis being dragged; for a horizontal strip that axis is the
 * vertical one.
 */
const COMMIT_ID = 'changes.commit';
/** How much room the commit message takes by default: three lines and the buttons. */
const COMMIT_HEIGHT = 96;
/** Below this a field stops being a field: one line of text and the buttons. */
const COMMIT_MIN = 64;
/** The list has no right to squeeze down to nothing: it is the main thing here. */
const LIST_KEEP = 120;

/**
 * The changes panel: what has changed, what we are committing, what is on the shelf.
 *
 * It reads top to bottom in exactly the order the human works in: the list of files
 * with tick boxes → the message → the buttons → the shelf. The shelf is at the bottom
 * because it is turned to less often, but it is obliged to be visible: a shelf that has
 * been forgotten is work that has been lost.
 */
export function ChangesPanel({
  changes,
  windows,
  onOpen,
  onDiff,
  onShelfDiff,
  onMenu,
  onShelfMenu,
  onShelve,
  onRefresh,
  typeahead,
  shown,
}: {
  changes: Changes;
  /** The geometry belongs to the widgets plugin; it arrives here as a prop. */
  windows: UiPlugin['windows'];
  /** A double click: open the file in the editor for real. */
  onOpen: (path: string) => void;
  /** A single one: show the diff on top of the editor. */
  onDiff: (row: ChangeRow) => void;
  /** A click on a file inside an opened shelf entry: show what is put aside. */
  onShelfDiff: (item: ShelfItem, path: string) => void;
  /** The right button on a row or on a list's heading. */
  onMenu: (at: { x: number; y: number }, list: Changelist | null) => void;
  /** The right button on a shelf entry. */
  onShelfMenu: (at: { x: number; y: number }, item: ShelfItem) => void;
  /** "To the shelf": the name is asked for by a modal rather than by us. */
  onShelve: () => void;
  /** Re-read git's state by hand. */
  onRefresh: () => void;
  /** Search by letters is a common widget, the same as in the tree. */
  typeahead: Typeahead;
  /** Whose diff is on show right now: the row is obliged to show that. */
  shown: string | null;
}) {
  const t = useT();
  const rows = changes.rows.value;
  const picked = changes.picked.value.length;
  const shelf = changes.shelf.value;
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const height = windows.geometry.widthOf(COMMIT_ID, COMMIT_HEIGHT);
  const term = typeahead.term.value;

  return (
    <div class="chg" data-keys="changes">
      <div class="chg-head">
        <span class="chg-all">{t('changes.picked', { picked, total: rows.length })}</span>
        <button
          type="button"
          class="chg-refresh"
          onMouseEnter={(event) => windows.tips.show(event.currentTarget as Element, t('changes.refresh'))}
          onMouseLeave={() => windows.tips.hide()}
          onClick={() => {
            windows.tips.hide();
            onRefresh();
          }}
        >
          <RefreshIcon />
        </button>
      </div>

      <div
        class="chg-list"
        ref={list}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu({ x: event.clientX, y: event.clientY }, null);
        }}
        onClick={() => {
          typeahead.clear();
          field.current?.focus({ preventScroll: true });
        }}
      >
        <div class="chg-find">
          <div class={`chg-find-box ${term ? 'is-on' : ''} ${typeahead.found.value ? '' : 'is-missing'}`}>
            <span class="chg-find-icon">⌕</span>
            <input
              ref={field}
              class="chg-find-input"
              value={term}
              spellcheck={false}
              autocomplete="off"
              aria-label={t('changes.find')}
              onInput={(event) => typeahead.type(event.currentTarget.value)}
              onBlur={() => typeahead.clear()}
            />
          </div>
        </div>

        {rows.length === 0 && <div class="chg-empty">{t('changes.clean')}</div>}
        {changes.groups.value.map((group) => (
          <Group
            key={group.list.id}
            group={group}
            changes={changes}
            onOpen={onOpen}
            onDiff={onDiff}
            onMenu={onMenu}
            typeahead={typeahead}
            shown={shown}
          />
        ))}
      </div>

      <Resizer
        windows={windows}
        id={COMMIT_ID}
        side="right"
        axis="y"
        defaultWidth={COMMIT_HEIGHT}
        limits={() => {
          const spare = (list.current?.clientHeight ?? 0) - LIST_KEEP;
          return { min: COMMIT_MIN, max: Math.max(COMMIT_MIN, height + spare) };
        }}
      />

      <div class="chg-commit" style={{ height: `${height}px` }}>
        <textarea
          class="chg-message"
          spellcheck={false}
          placeholder={t('changes.message')}
          value={changes.message.value}
          onInput={(event) => (changes.message.value = (event.target as HTMLTextAreaElement).value)}
        />
        {changes.error.value !== '' && <div class="chg-error">{changes.error.value}</div>}
        {changes.conflicts.value.length > 0 && (
          <div class="chg-note">
            {t('changes.unshelveConflict')} {changes.conflicts.value.join(', ')}
          </div>
        )}
        {changes.restored.value.length > 0 && (
          <div class="chg-note">
            {t('changes.unshelveRestored')} {changes.restored.value.join(', ')}
          </div>
        )}
        <div class="chg-buttons">
          <label class="chg-amend">
            <input
              type="checkbox"
              checked={changes.amend.value}
              onChange={() => void changes.toggleAmend()}
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
            onClick={() => onShelve()}
          >
            {t('changes.shelve')}
          </button>
        </div>

        <div class="chg-who">
          <input
            class={`chg-who-field ${changes.authorName.value.trim() === '' ? 'is-missing' : ''}`}
            spellcheck={false}
            autocomplete="off"
            placeholder={t('changes.authorName')}
            value={changes.authorName.value}
            onInput={(event) => (changes.authorName.value = (event.target as HTMLInputElement).value)}
            onBlur={() => void changes.saveIdentity()}
          />
          <input
            class={`chg-who-field ${changes.authorEmail.value.trim() === '' ? 'is-missing' : ''}`}
            spellcheck={false}
            autocomplete="off"
            placeholder={t('changes.authorEmail')}
            value={changes.authorEmail.value}
            onInput={(event) => (changes.authorEmail.value = (event.target as HTMLInputElement).value)}
            onBlur={() => void changes.saveIdentity()}
          />
        </div>
      </div>

      <div class="chg-shelf">
        <div class="chg-section">{t('changes.shelf', { count: shelf.length })}</div>
        <div class="chg-shelf-list">
        {shelf.length === 0 && <div class="chg-empty">{t('changes.shelfEmpty')}</div>}
        {shelf.map((item) => (
          <div class="chg-shelf-item" key={item.id}>
          <div
            class={`chg-shelf-row ${changes.openShelf.value === item.id ? 'is-open' : ''}`}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onShelfMenu({ x: event.clientX, y: event.clientY }, item);
            }}
          >
            <ShelfBox id={item.id} changes={changes} />
            <button
              type="button"
              class="chg-shelf-name"
              title={item.files.join('\n')}
              onClick={() => changes.toggleShelf(item.id)}
            >
              <span class="chg-shelf-chevron">
                <Chevron />
              </span>
              {item.name}
            </button>
            <span class="chg-shelf-do">
              <button type="button" class="chg-shelf-drop" onClick={() => void changes.drop(item.id)}>
                ×
              </button>
            </span>
            <span class="chg-shelf-when">{when(item.at)}</span>
          </div>
          {changes.openShelf.value === item.id &&
            item.files.map((path) => (
              <div class="chg-shelf-file-row" key={path}>
                <input
                  type="checkbox"
                  checked={(changes.shelfPicked.value[item.id] ?? []).includes(path)}
                  onChange={() => changes.toggleShelfFile(item.id, path)}
                />
                <button
                  type="button"
                  class={`chg-shelf-file ${shown === path ? 'is-shown' : ''}`}
                  title={path}
                  onClick={() => onShelfDiff(item, path)}
                >
                  <span class="chg-icon">
                    <FileIcon name={path.split('/').pop() ?? path} />
                  </span>
                  <span class="chg-shelf-file-name">{path}</span>
                </button>
              </div>
            ))}
          </div>
        ))}
        </div>
        {shelf.length > 0 && (
          <div class="chg-shelf-buttons">
            <button
              type="button"
              class="chg-shelve"
              disabled={changes.busy.value || !changes.canUnshelve.value}
              onClick={() => void changes.unshelvePicked()}
            >
              {t('changes.unshelve')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A shelf entry's tick box: the third state is drawn by the DOM alone. */
function ShelfBox({ id, changes }: { id: string; changes: Changes }) {
  const box = useRef<HTMLInputElement>(null);
  const state = changes.shelfChecked(id);
  if (box.current) box.current.indeterminate = state === 'some';
  return (
    <input
      ref={box}
      type="checkbox"
      checked={state === 'all'}
      onChange={() => changes.toggleShelfItem(id)}
    />
  );
}

/**
 * A changelist: the chevron, the tick box, the name and the count.
 *
 * A folded one NAMES how many rows are in it: without the number a folded list is
 * indistinguishable from an empty one. The tick box has three states — "all", "some",
 * "none" — and shows the STATE of the contents rather than its own.
 */
function Group({
  group,
  changes,
  onOpen,
  onDiff,
  onMenu,
  typeahead,
  shown,
}: {
  group: ChangeGroup;
  changes: Changes;
  onOpen: (path: string) => void;
  onDiff: (row: ChangeRow) => void;
  onMenu: (at: { x: number; y: number }, list: Changelist | null) => void;
  typeahead: Typeahead;
  shown: string | null;
}) {
  const t = useT();
  const box = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const accepts = (event: DragEvent) => event.dataTransfer?.types.includes(DRAG_TYPE) ?? false;
  const take = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const raw = event.dataTransfer?.getData(DRAG_TYPE);
    if (raw) void changes.moveTo(group.list.id, JSON.parse(raw) as string[]);
  };
  if (box.current) box.current.indeterminate = group.checked === 'some';

  return (
    <div
      class={`chg-group ${over ? 'is-drop' : ''}`}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) setOver(false);
      }}
      onDrop={take}
    >
      <div
        class={`chg-group-head ${group.folded ? 'is-folded' : ''}`}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onMenu({ x: event.clientX, y: event.clientY }, group.list);
        }}
      >
        <input
          ref={box}
          type="checkbox"
          checked={group.checked === 'all'}
          disabled={group.rows.length === 0}
          onChange={() => changes.toggleGroup(group.list.id)}
        />
        <button type="button" class="chg-group-name" onClick={() => changes.toggleFold(group.list.id)}>
          <span class="chg-group-chevron">
            <Chevron />
          </span>
          <span class="chg-group-title">{group.list.name}</span>
          <span class="chg-group-count">{group.rows.length}</span>
        </button>
      </div>
      {!group.folded &&
        group.rows.map((row) => (
          <Row
            key={row.path}
            row={row}
            changes={changes}
            onOpen={onOpen}
            onDiff={onDiff}
            onMenu={onMenu}
            typeahead={typeahead}
            shown={shown === row.path}
          />
        ))}
      {!group.folded && group.rows.length === 0 && group.list.id === DEFAULT_LIST && (
        <div class="chg-empty">{t('changes.clean')}</div>
      )}
    </div>
  );
}

function Row({
  row,
  changes,
  onOpen,
  onDiff,
  onMenu,
  typeahead,
  shown,
}: {
  row: ChangeRow;
  changes: Changes;
  onOpen: (path: string) => void;
  onDiff: (row: ChangeRow) => void;
  onMenu: (at: { x: number; y: number }, list: Changelist | null) => void;
  typeahead: Typeahead;
  shown: boolean;
}) {
  const t = useT();
  const name = row.path.split('/').pop() ?? row.path;
  const folder = row.path.slice(0, row.path.length - name.length).replace(/\/$/, '');
  const selected = changes.selected.value.includes(row.path);
  const focused = changes.focus.value === row.path;
  const hit = typeahead.match(name);
  return (
    <div
      class={`chg-row is-${row.state} ${shown ? 'is-shown' : ''} ${selected ? 'is-picked' : ''} ${focused ? 'is-current' : ''}`}
      draggable
      onDragStart={(event) => {
        const paths = changes.selected.value.includes(row.path) ? changes.selected.value : [row.path];
        event.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(paths));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!selected) changes.pick(row.path);
        onMenu({ x: event.clientX, y: event.clientY }, null);
      }}
    >
      <input type="checkbox" checked={row.picked} onChange={() => changes.toggleFile(row.path)} />
      <button
        type="button"
        class="chg-open"
        onClick={(event) => {
          changes.pick(row.path, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey });
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey) onDiff(row);
        }}
        onDblClick={() => onOpen(row.path)}
        title={row.path}
      >
        <span class="chg-icon">
          <FileIcon name={name} />
        </span>
        <span class="chg-name">{found(name, hit)}</span>
        {row.from && <span class="chg-moved">{t('changes.movedFrom', { from: row.from })}</span>}
        <span class="chg-folder">{folder}</span>
      </button>
    </div>
  );
}

/**
 * The name with the match highlighted: by a backing rather than by boldness — bold
 * changes the width of the row on every letter typed.
 */
function found(name: string, hit: [number, number] | null) {
  if (!hit) return name;
  return (
    <>
      {name.slice(0, hit[0])}
      <mark class="chg-hit">{name.slice(hit[0], hit[1])}</mark>
      {name.slice(hit[1])}
    </>
  );
}

/**
 * When it was put aside. Today's by the hour, the rest by the date: "21:04" about the
 * day before yesterday's patch answers no question at all.
 */
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
