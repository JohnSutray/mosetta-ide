import { tips } from '@ide/windows';
import { useLayoutEffect, useRef } from 'preact/hooks';

export function Tip() {
  const shown = tips.spot.value;
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !shown) return;
    el.style.left = '0px';
    el.style.top = '0px';
    const tip = { width: el.offsetWidth, height: el.offsetHeight };
    const view = { width: window.innerWidth, height: window.innerHeight };
    const { left, top } = tips.place(shown, tip, view);
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
