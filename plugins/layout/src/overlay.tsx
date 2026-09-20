import { useEffect, useRef } from 'preact/hooks';
import type { MainOverlay } from './schema.js';

export function Overlay({
  overlay,
  title,
  closeTitle,
}: {
  overlay: MainOverlay;
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
