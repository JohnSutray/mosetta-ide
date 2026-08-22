import { useEffect } from 'preact/hooks';
import { activeEditor } from '../state/editor.js';
import { closeHunk, hunkPopup, revertOpenHunk } from '../state/git-marks.js';
import { enter, leave } from '../state/popups.js';
import { t } from '../i18n/index.js';

export function HunkPopup() {
  const open = hunkPopup.value;
  const alive = activeEditor.value !== null;

  useEffect(() => {
    if (!open || !alive) return;
    enter({ id: 'hunk', close: closeHunk });
    const away = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.hunk-popup')) closeHunk();
    };
    window.addEventListener('mousedown', away, { capture: true });
    return () => {
      leave('hunk');
      window.removeEventListener('mousedown', away, { capture: true });
    };
  }, [open, alive]);

  if (!open || !alive) return null;

  const { hunk, x, y } = open;
  const title =
    hunk.kind === 'added'
      ? t('git.hunk.added')
      : hunk.kind === 'removed'
        ? t('git.hunk.removed')
        : t('git.hunk.modified');

  return (
    <div
      class="hunk-popup"
      style={{ left: `${Math.round(x)}px`, top: `${Math.round(y)}px` }}
    >
      <div class="hunk-head">
        <span class="hunk-title">{title}</span>
        <button class="button" onClick={revertOpenHunk}>
          {t('git.hunk.revert')}
        </button>
      </div>
      {hunk.before.length > 0 && (
        <div class="hunk-before">
          {hunk.before.map((line, at) => (
            <div class="hunk-line" key={at}>
              {line === '' ? ' ' : line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
