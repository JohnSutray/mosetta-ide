import { settingsOf, t } from '@ide/api/client';
import type { MergeFile } from './types.js';
import { MergeColumns } from './columns.js';
import type CodePlugin from '@ide/plugin-code';
import { EDITOR_DEFAULTS } from '@ide/plugin-code';
import { FileIcon, Popup } from '@ide/ui';
import type { Merge } from './state.js';

export function MergeScreen({ merge, code }: { merge: Merge; code: CodePlugin }) {
  if (!merge.open.value) return null;
  const session = merge.session.value;
  const file = merge.file.value;
  const editor = settingsOf('editor', EDITOR_DEFAULTS).value;
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
        <span class="merge-title">{t(session.title)}</span>
        <span class="merge-path">{file.path}</span>
        {whole && (
          <span class="merge-reason">
            {t(file.right.text === null ? 'merge.reason.diskGone' : 'merge.reason.editorGone')}
          </span>
        )}
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
            <WholeFile file={file} merge={merge} code={code} />
          ) : (
            <MergeColumns
              code={code}
              diff3={merge.diff3}
              path={file.path}
              regions={merge.regions.value}
              choices={merge.choices.value}
              cursor={merge.cursor.value}
              settings={editor}
              leftLabel={t(file.left.label)}
              rightLabel={t(file.right.label)}
              onDecide={(at, side, choice) => merge.decide(at, side, choice)}
              onPick={(at) => merge.setCursor(at)}
            />
          )}
        </div>
      </div>

      <div class="merge-foot">
        <button type="button" class="merge-button" onClick={() => merge.acceptSide('left')}>
          {t('merge.acceptLeft', { side: t(file.left.label) })}
        </button>
        <button type="button" class="merge-button" onClick={() => merge.acceptSide('right')}>
          {t('merge.acceptRight', { side: t(file.right.label) })}
        </button>

        <span class="merge-status">
          {whole
            ? t('merge.wholeFile')
            : left > 0
              ? t('merge.left', { count: String(left) })
              : t('merge.clean')}
        </span>

        {!whole && (
          <button
            type="button"
            class="merge-button is-main"
            disabled={!merge.ready.value}
            title={merge.ready.value ? t('merge.confirm') : t('merge.confirm.blocked')}
            onClick={() => void merge.resolve()}
          >
            {t('merge.confirm')}
          </button>
        )}
        <button type="button" class="merge-button is-quiet" onClick={() => void merge.cancel()}>
          {t('merge.cancel')}
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

function WholeFile({ file, merge, code }: { file: MergeFile; merge: Merge; code: CodePlugin }) {
  const survivor = file.left.text === null ? 'right' : 'left';
  const side = file[survivor];
  const gone = file[survivor === 'left' ? 'right' : 'left'];
  const editor = settingsOf('editor', EDITOR_DEFAULTS).value;

  return (
    <div class="merge-whole">
      <div class="merge-whole-cards">
        <div class="merge-card">
          <div class="merge-card-title">{t(gone.label)}</div>
          <div class="merge-card-body is-gone">
            <div class="merge-card-sign">🗑</div>
            <div class="merge-card-text">{t('merge.deleted')}</div>
          </div>
          <button
            type="button"
            class="merge-button is-main"
            onClick={() => void merge.resolve(null)}
          >
            {t('merge.acceptDelete')}
          </button>
        </div>

        <div class="merge-card">
          <div class="merge-card-title">{t(side.label)}</div>
          <div class="merge-card-body">
            <code.View path={file.path} text={side.text ?? ''} line={-1} settings={editor} />
          </div>
          <button
            type="button"
            class="merge-button is-main"
            onClick={() => void merge.resolve(side.text)}
          >
            {t('merge.keepFile')}
          </button>
        </div>
      </div>
    </div>
  );
}
