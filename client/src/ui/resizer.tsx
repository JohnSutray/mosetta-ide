import { useRef } from 'preact/hooks';
import { setPanelWidth, widthOf } from '../state/layout.js';
import { PANELS, type PanelSide } from './panels.js';

const PANEL_DEFAULTS: Record<string, number> = Object.fromEntries(
  PANELS.map((panel) => [panel.id, panel.defaultWidth]),
);

export function Resizer({ id, side }: { id: string; side: PanelSide }) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  return (
    <div
      class="resizer"
      onPointerDown={(event) => {
        event.preventDefault();
        drag.current = { startX: event.clientX, startWidth: widthOf(id) };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const started = drag.current;
        if (!started) return;
        const delta = event.clientX - started.startX;
        setPanelWidth(id, started.startWidth + (side === 'left' ? delta : -delta));
      }}
      onPointerUp={(event) => {
        drag.current = null;
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      }}
      onDblClick={() => {
        const panel = PANEL_DEFAULTS[id];
        if (panel !== undefined) setPanelWidth(id, panel);
      }}
    />
  );
}
