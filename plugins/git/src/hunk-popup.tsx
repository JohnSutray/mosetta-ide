import { useIde, useT } from '@mosetta/ide-api/client';
import type { GitMarks } from './marks.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Windows } from '@mosetta/ide-plugin-ui';
import type DocPlugin from '@mosetta/ide-plugin-doc';

/**
 * "How it was" — a popup next to the git strip.
 *
 * Not a modal: the conversation is about particular lines, and taking one's eyes away
 * from them to the middle of the screen means losing the place. It stands BELOW them or
 * ABOVE them, but never over: "how it was" can only be compared with "how it is" when
 * both are visible. It closes on a click outside — like a dropdown menu.
 *
 * The lines inside are deliberately not highlighted by language: this is a QUOTATION
 * from the history rather than code being edited. Highlighting would make it look like
 * a second editor, which is not what it is.
 */
export function HunkPopup({ docs, windows, marks }: { docs: DocPlugin; windows: Windows; marks: GitMarks }) {
  const t = useT();
  const mount = useIde().mount;
  const open = marks.popup.value;
  const self = useRef<HTMLDivElement>(null);
  /**
   * We place it BELOW the changed lines, and if it does not fit below, above them. The
   * height is learned after the first showing: before that nobody knows it, and
   * guessing from the number of lines means missing on every long hunk.
   */
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
