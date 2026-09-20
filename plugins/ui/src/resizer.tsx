import type { Windows } from './windows/windows.js';
import { useRef } from 'preact/hooks';

/**
 * The border between columns, dragged with the mouse.
 *
 * The cursor promises the truth: `col-resize` appears exactly where dragging really is
 * possible, and nowhere else.
 *
 * We capture the pointer, so a quick movement beyond the strip — or beyond the window —
 * does not drop the drag halfway.
 *
 * The limits arrive from OUTSIDE and they arrive ALWAYS. They used to be optional, and
 * then the resizer reached into the panel registry for a minimum width itself — that
 * is, it knew panels existed. The layout moved into a plugin while the resizer stayed
 * shared: it is needed both by columns and by the resizers inside dialogs, where the
 * width is measured from the dialog's window. A shared widget has no business knowing
 * about panels.
 */
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
  /**
   * A left one grows rightwards, a right one leftwards: you always drag away from
   * yourself.
   */
  side: 'left' | 'right';
  /**
   * Which axis is dragged. `y` makes it a horizontal bar: the block below grows
   * upwards, exactly as a right-hand panel grows leftwards.
   */
  axis?: 'x' | 'y';
  limits: () => { min: number; max: number };
  /** Where to return to on a double click. */
  defaultWidth: number;
  /**
   * How much is shown RIGHT NOW, if that is not the remembered width: the layout
   * squeezes columns for the middle's sake, and one has to drag from what is visible —
   * otherwise the first movement of the mouse jumps to the remembered value.
   */
  width?: () => number;
  /** The strip was grabbed. This tells the layout whose width is now the leading one. */
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
