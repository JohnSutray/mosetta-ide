import type { Tips } from './windows/tips.js';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { useIde } from '@mosetta/ide-api/client';

/**
 * The tooltip. One for the whole application: there are many tooltips, and exactly one
 * is ever shown — the one the mouse is currently under.
 *
 * The mouse does not catch it (`pointer-events: none`): a tooltip appears next to what
 * is hovered, and it must not intercept the hover — otherwise it would put itself out.
 */
export function Tip({ tips }: { tips: Tips }) {
  const shown = tips.spot.value;
  const mount = useIde().mount;
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !shown) return;
    el.style.left = '0px';
    el.style.top = '0px';
    const tip = { width: el.offsetWidth, height: el.offsetHeight };
    const size = mount.size.value;
    const view = { width: size.w, height: size.h };
    const at = mount.local(shown.x, shown.y);
    const above = mount.local(shown.x, shown.above).y;
    const { left, top } = tips.place({ ...shown, x: at.x, y: at.y, above }, tip, view);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [shown]);

  if (!shown) return null;

  return (
    <div ref={box} class="tip" style={{ left: '0px', top: '0px' }}>
      <span class="tip-title">{shown.title}</span>
      {shown.keys.map((key) => (
        <span key={key} class="tip-key">
          {key}
        </span>
      ))}
    </div>
  );
}
