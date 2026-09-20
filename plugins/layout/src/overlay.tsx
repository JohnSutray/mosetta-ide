import { useEffect, useRef } from 'preact/hooks';
import type { MainOverlay } from './schema.js';

/**
 * The frame of whatever covered the middle.
 *
 * It looks like a panel because it is one: the same header, the same cross, the same
 * place. It differs in one thing — it is temporary, and underneath it everything stayed
 * as it was.
 *
 * We take focus by the fact of being born — and by the fact of the CONTENT CHANGING. A
 * surface with keys of its own has to be able to hold the OS focus: an ordinary `div`
 * does not take it, and Escape would go to the editor lying UNDER the overlay — that
 * is, would close something other than what the human is looking at.
 *
 * The change matters no less than the birth (found by a live check): an overlay is
 * opened by a CLICK on a list row, and a click leaves focus on the row. A second click
 * on a neighbouring row does not recreate the frame — and without this rule Escape
 * stopped closing right after the human looked at a second file.
 */
export function Overlay({
  overlay,
  title,
  closeTitle,
}: {
  overlay: MainOverlay;
  /**
   * An already translated title: the dictionary is the layout's business, not the
   * frame's.
   */
  title: string;
  closeTitle: string;
}) {
  const frame = useRef<HTMLElement>(null);

  useEffect(() => {
    if (overlay.takesFocus === false) return;
    frame.current?.focus({ preventScroll: true });
  }, [overlay.id, title, overlay.takesFocus]);

  return (
    <section class="panel is-overlay" ref={frame} tabIndex={-1} data-keys={overlay.keys}>
      <header class="panel-head">
        <span class="panel-title">{title}</span>
        <span class="panel-actions">
          {overlay.badges?.() as never}
          <span class="panel-close" title={closeTitle} onClick={() => overlay.close()}>
            ×
          </span>
        </span>
      </header>
      <div class="panel-body">{overlay.view() as never}</div>
    </section>
  );
}
