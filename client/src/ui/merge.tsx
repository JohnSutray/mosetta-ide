import { config } from '../state/config.js';
import { merge } from '../state/merge.js';
import type { MergeFile } from '@ide/protocol';
import { MergeColumns } from './merge-columns.js';
import { Popup } from './popup.js';
import { FileIcon } from './file-icons.js';
import { CodeView } from '../editor/code-view.js';
import { i18n } from '../i18n/index.js';

export function MergeScreen() {
  if (!merge.open.value) return null;
  const session = merge.session.value;
  const file = merge.file.value;
  const settings = config.editor();
  if (!session || !file) return null;

  const whole = file.left.text === null || file.right.text === null;
  const left = merge.left.value;

  return (
    <Popup
      id="merge"
      keys="merge"
      full
      class="merge"
      size={{ w: 1200, h: 800 }}
      min={{ w: 700, h: 400 }}
      onClose={() => merge.close()}
    >
      <div class="merge-head">
        <span class="merge-title">{i18n.t(session.title)}</span>
        <span class="merge-path">{file.path}</span>
      </div>

      <div class="merge-body">
        <div class="merge-files">
          {session.files.map((item) => (
            <FileRow
              key={item.path}
              file={item}
              active={item.path === file.path}
              onPick={() => merge.pickFile(item.path)}
            />
          ))}
        </div>

        <div class="merge-work">
          {whole ? (
            <WholeFile file={file} />
          ) : (
            <MergeColumns
              path={file.path}
              regions={merge.regions.value}
              choices={merge.choices.value}
              cursor={merge.cursor.value}
              settings={settings}
              leftLabel={i18n.t(file.left.label)}
              rightLabel={i18n.t(file.right.label)}
              onDecide={(at, side, choice) => merge.decide(at, side, choice)}
              onPick={(at) => merge.setCursor(at)}
            />
          )}
        </div>
      </div>

      <div class="merge-foot">
        <button type="button" class="merge-button" onClick={() => merge.acceptSide('left')}>
          {i18n.t('merge.acceptLeft', { side: i18n.t(file.left.label) })}
        </button>
        <button type="button" class="merge-button" onClick={() => merge.acceptSide('right')}>
          {i18n.t('merge.acceptRight', { side: i18n.t(file.right.label) })}
        </button>

        <span class="merge-status">
          {whole
            ? i18n.t('merge.wholeFile')
            : left > 0
              ? i18n.t('merge.left', { count: String(left) })
              : i18n.t('merge.clean')}
        </span>

        {!whole && (
          <button
            type="button"
            class="merge-button is-main"
            disabled={!merge.ready.value}
            title={merge.ready.value ? i18n.t('merge.confirm') : i18n.t('merge.confirm.blocked')}
            onClick={() => void merge.resolve()}
          >
            {i18n.t('merge.confirm')}
          </button>
        )}
        <button type="button" class="merge-button is-quiet" onClick={() => void merge.cancel()}>
          {i18n.t('merge.cancel')}
        </button>
      </div>
    </Popup>
  );
}

function FileRow({
  file,
  active,
  onPick,
}: {
  file: MergeFile;
  active: boolean;
  onPick: () => void;
}) {
  const name = file.path.slice(file.path.lastIndexOf('/') + 1);
  const dir = file.path.slice(0, file.path.lastIndexOf('/'));
  return (
    <div
      class={`merge-file ${active ? 'is-active' : ''} ${file.done ? 'is-done' : ''}`}
      onMouseDown={onPick}
    >
      <FileIcon name={name} />
      <span class="merge-file-name">{name}</span>
      {dir && <span class="merge-file-dir">{dir}</span>}
      <span class="merge-file-mark">{file.done ? '✓' : ''}</span>
    </div>
  );
}

function WholeFile({ file }: { file: MergeFile }) {
  const survivor = file.left.text === null ? 'right' : 'left';
  const side = file[survivor];
  const gone = file[survivor === 'left' ? 'right' : 'left'];
  const settings = config.editor();

  return (
    <div class="merge-whole">
      <div class="merge-whole-cards">
        <div class="merge-card">
          <div class="merge-card-title">{i18n.t(gone.label)}</div>
          <div class="merge-card-body is-gone">
            <div class="merge-card-sign">🗑</div>
            <div class="merge-card-text">{i18n.t('merge.deleted')}</div>
          </div>
          <button
            type="button"
            class="merge-button is-main"
            onClick={() => void merge.resolve(null)}
          >
            {i18n.t('merge.acceptDelete')}
          </button>
        </div>

        <div class="merge-card">
          <div class="merge-card-title">{i18n.t(side.label)}</div>
          <div class="merge-card-body">
            <CodeView path={file.path} text={side.text ?? ''} line={-1} settings={settings} />
          </div>
          <button
            type="button"
            class="merge-button is-main"
            onClick={() => void merge.resolve(side.text)}
          >
            {i18n.t('merge.keepFile')}
          </button>
        </div>
      </div>
    </div>
  );
}
