import type { Windows } from './windows/windows.js';
import { useRef } from 'preact/hooks';

export function Resizer({ windows,
  id,
  side,
  axis = 'x',
  limits,
  defaultWidth,
  width,
  onGrab,
}: { windows: Windows;
  id: string;
  side: 'left' | 'right';
  axis?: 'x' | 'y';
  limits: () => { min: number; max: number };
  defaultWidth: number;
  width?: () => number;
  onGrab?: () => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const apply = (px: number) => windows.geometry.setWidth(id, px, limits());

  return (
    <div
      class={`resizer ${axis === 'y' ? 'is-y' : ''}`}
      onPointerDown={(event) => {
        event.preventDefault();
        onGrab?.();
        drag.current = {
          startX: axis === 'y' ? event.clientY : event.clientX,
          startWidth: width?.() ?? windows.geometry.widthOf(id, defaultWidth),
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
