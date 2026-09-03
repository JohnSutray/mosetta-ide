import { openDoc, t } from '@ide/api/client';
import type { GitMarks } from './marks.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { popups } from '@ide/ui';

export function HunkPopup({ marks }: { marks: GitMarks }) {
  const open = marks.popup.value;
  const self = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(open ? open.box.bottom + 4 : 0);
  const alive = openDoc.value !== null;

  useLayoutEffect(() => {
    if (!open || !self.current) return;
    const height = self.current.getBoundingClientRect().height;
    const below = open.box.bottom + 4;
    const above = open.box.top - height - 4;
    setTop(below + height <= window.innerHeight - 8 || above < 8 ? below : above);
  }, [open]);

  useEffect(() => {
    if (!open || !alive) return;
    popups.enter({ id: 'hunk', close: () => marks.close(), layer: true });
    const away = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.hunk-popup')) marks.close();
    };
    window.addEventListener('mousedown', away, { capture: true });
    return () => {
      popups.leave('hunk');
      window.removeEventListener('mousedown', away, { capture: true });
    };
  }, [open, alive]);

  if (!open || !alive) return null;

  const { hunk, box } = open;
  const title =
    hunk.kind === 'added'
      ? t('git.hunk.added')
      : hunk.kind === 'removed'
        ? t('git.hunk.removed')
        : t('git.hunk.modified');

  return (
    <div
      ref={self}
      class="hunk-popup"
      style={{ left: `${Math.round(box.left)}px`, top: `${Math.round(top)}px` }}
    >
      <div class="hunk-head">
        <span class="hunk-title">{title}</span>
        <button class="button" onClick={() => marks.revertOpen()}>
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
