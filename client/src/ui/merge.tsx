import type { MergeFile } from '@ide/protocol';
import { DEFAULT_SETTINGS_FALLBACK } from '../state/fallback.js';
import { settings as settingsSignal } from '../state/config.js';
import {
  acceptSide,
  cancelMerge,
  closeMerge,
  decide,
  mergeChoices,
  mergeLeft,
  mergeCursor,
  setMergeCursor,
  mergeFile,
  mergeReady,
  mergeRegions,
  mergeSession,
  mergeOpen,
  pickMergeFile,
  resolveMerge,
} from '../state/merge.js';
import { MergeColumns } from './merge-columns.js';
import { Popup } from './popup.js';
import { FileIcon } from './file-icons.js';
import { CodeView } from '../editor/code-view.js';
import { t } from '../i18n/index.js';

export function MergeScreen() {
  if (!mergeOpen.value) return null;
  const session = mergeSession.value;
  const file = mergeFile.value;
  const settings = settingsSignal.value?.editor ?? DEFAULT_SETTINGS_FALLBACK.editor;
  if (!session || !file) return null;

  const whole = file.left.text === null || file.right.text === null;
  const left = mergeLeft.value;

  return (
    <Popup
      id="merge"
      keys="merge"
      full
      class="merge"
      size={{ w: 1200, h: 800 }}
      min={{ w: 700, h: 400 }}
      onClose={closeMerge}
    >
      <div class="merge-head">
        <span class="merge-title">{t(session.title)}</span>
        <span class="merge-path">{file.path}</span>
      </div>

      <div class="merge-body">
        <div class="merge-files">
          {session.files.map((item) => (
            <FileRow
              key={item.path}
              file={item}
              active={item.path === file.path}
              onPick={() => pickMergeFile(item.path)}
            />
          ))}
        </div>

        <div class="merge-work">
          {whole ? (
            <WholeFile file={file} />
          ) : (
            <MergeColumns
              path={file.path}
              regions={mergeRegions.value}
              choices={mergeChoices.value}
              cursor={mergeCursor.value}
              settings={settings}
              leftLabel={t(file.left.label)}
              rightLabel={t(file.right.label)}
              onDecide={decide}
              onPick={setMergeCursor}
            />
          )}
        </div>
      </div>

      <div class="merge-foot">
        <button type="button" class="merge-button" onClick={() => acceptSide('left')}>
          {t('merge.acceptLeft', { side: t(file.left.label) })}
        </button>
        <button type="button" class="merge-button" onClick={() => acceptSide('right')}>
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
            disabled={!mergeReady.value}
            title={mergeReady.value ? t('merge.confirm') : t('merge.confirm.blocked')}
            onClick={() => void resolveMerge()}
          >
            {t('merge.confirm')}
          </button>
        )}
        <button type="button" class="merge-button is-quiet" onClick={() => void cancelMerge()}>
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

function WholeFile({ file }: { file: MergeFile }) {
  const survivor = file.left.text === null ? 'right' : 'left';
  const side = file[survivor];
  const gone = file[survivor === 'left' ? 'right' : 'left'];
  const settings = settingsSignal.value?.editor ?? DEFAULT_SETTINGS_FALLBACK.editor;

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
            onClick={() => void resolveMerge(null)}
          >
            {t('merge.acceptDelete')}
          </button>
        </div>

        <div class="merge-card">
          <div class="merge-card-title">{t(side.label)}</div>
          <div class="merge-card-body">
            <CodeView path={file.path} text={side.text ?? ''} line={-1} settings={settings} />
          </div>
          <button
            type="button"
            class="merge-button is-main"
            onClick={() => void resolveMerge(side.text)}
          >
            {t('merge.keepFile')}
          </button>
        </div>
      </div>
    </div>
  );
}
