import { tips } from '../state/tip.js';
import { useLayoutEffect, useRef } from 'preact/hooks';

export function Tip() {
  const shown = tips.spot.value;
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !shown) return;
    const width = el.offsetWidth;
    const max = window.innerWidth - width - 8;
    el.style.left = `${Math.max(8, Math.min(shown.x, max))}px`;
  }, [shown]);

  if (!shown) return null;

  return (
    <div ref={box} class="tip" style={{ left: `${shown.x}px`, top: `${shown.y}px` }}>
      <span class="tip-title">{shown.title}</span>
      {shown.keys.map((key) => (
        <span key={key} class="tip-key">
          {key}
        </span>
      ))}
    </div>
  );
}
