import { useIde, useT } from '@mosetta/ide-api/client';
import type { GitMarks } from './marks.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Windows } from '@mosetta/ide-plugin-ui';
import type DocPlugin from '@mosetta/ide-plugin-doc';

export function HunkPopup({ docs, windows, marks }: { docs: DocPlugin; windows: Windows; marks: GitMarks }) {
  const t = useT();
  const mount = useIde().mount;
  const open = marks.popup.value;
  const self = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(open ? open.box.bottom + 4 : 0);
  const alive = docs.openDoc.value !== null;

  useLayoutEffect(() => {
    if (!open || !self.current) return;
    const height = self.current.getBoundingClientRect().height;
    const below = open.box.bottom + 4;
    const above = open.box.top - height - 4;
    const edge = mount.bounds();
    setTop(below + height <= edge.bottom - 8 || above < edge.top + 8 ? below : above);
  }, [open]);

  useEffect(() => {
    if (!open || !alive) return;
    windows.popups.enter({ id: 'hunk', close: () => marks.close(), layer: true });
    const away = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.hunk-popup')) marks.close();
    };
    const off = mount.listen('mousedown', away, { capture: true });
    return () => {
      windows.popups.leave('hunk');
      off();
    };
  }, [open, alive]);

  if (!open || !alive) return null;

  const { hunk, box } = open;
  const spot = mount.local(box.left, top);
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
      style={{ left: `${Math.round(spot.x)}px`, top: `${Math.round(spot.y)}px` }}
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
