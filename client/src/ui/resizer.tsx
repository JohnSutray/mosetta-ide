import { geometry } from '../state/layout.js';
import { useRef } from 'preact/hooks';

export function Resizer({
  id,
  side,
  axis = 'x',
  limits,
  defaultWidth,
}: {
  id: string;
  side: 'left' | 'right';
  axis?: 'x' | 'y';
  limits: () => { min: number; max: number };
  defaultWidth: number;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const apply = (px: number) => geometry.setWidth(id, px, limits());

  return (
    <div
      class={`resizer ${axis === 'y' ? 'is-y' : ''}`}
      onPointerDown={(event) => {
        event.preventDefault();
        drag.current = {
          startX: axis === 'y' ? event.clientY : event.clientX,
          startWidth: geometry.widthOf(id, defaultWidth),
        };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const started = drag.current;
        if (!started) return;
        const delta = (axis === 'y' ? event.clientY : event.clientX) - started.startX;
        apply(started.startWidth + (side === 'left' ? delta : -delta));
      }}
      onPointerUp={(event) => {
        drag.current = null;
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      }}
      onDblClick={() => {
        apply(defaultWidth);
      }}
    />
  );
}
