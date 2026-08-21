import { useRef } from 'preact/hooks';
import { setPanelWidth, setWidth, widthOf } from '../state/layout.js';
import { PANELS, type PanelSide } from './panels.js';

const PANEL_DEFAULTS: Record<string, number> = Object.fromEntries(
  PANELS.map((panel) => [panel.id, panel.defaultWidth]),
);

export function Resizer({
  id,
  side,
  axis = 'x',
  limits,
  defaultWidth,
}: {
  id: string;
  side: PanelSide;
  axis?: 'x' | 'y';
  limits?: () => { min: number; max: number };
  defaultWidth?: number;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const apply = (px: number) => {
    if (limits) setWidth(id, px, limits());
    else setPanelWidth(id, px);
  };

  return (
    <div
      class={`resizer ${axis === 'y' ? 'is-y' : ''}`}
      onPointerDown={(event) => {
        event.preventDefault();
        drag.current = {
          startX: axis === 'y' ? event.clientY : event.clientX,
          startWidth: widthOf(id, defaultWidth),
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
        const back = defaultWidth ?? PANEL_DEFAULTS[id];
        if (back !== undefined) apply(back);
      }}
    />
  );
}
