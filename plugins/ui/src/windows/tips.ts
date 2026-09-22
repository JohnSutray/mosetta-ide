import { signal } from '@preact/signals';

/**
 * A tooltip over an element — our own rather than the browser's.
 *
 * The native `title` will not do for three reasons at once: it appears after a second
 * and more, it is drawn in the system style past the theme, and its contents cannot be
 * laid out — the action and the key stick together into one line.
 *
 * Ours appears instantly and knows about parts: what it does, and what it is called by.
 */

export interface TipSpot {
  /** Where to stand: the left edge and the bottom of the element it belongs to. */
  x: number;
  y: number;
  /** The element's top: it did not fit below — we stand ABOVE it. */
  above: number;
  title: string;
  /** The keys, each on a plate of its own. */
  keys: string[];
}

/** The tooltip's and the window's sizes — so as to compute the place without the DOM. */
export interface TipBox {
  width: number;
  height: number;
}

export class Tips {
  readonly spot = signal<TipSpot | null>(null);

  /** How far to drop the tooltip below the element so that it does not cover it. */
  private readonly gap = 6;

  /** The margin from the window's edge: a tooltip does not stick flush to it. */
  private readonly edge = 8;

  show(target: Element, title: string, keys: string[] = []): void {
    const box = target.getBoundingClientRect();
    this.spot.value = {
      x: box.left,
      y: box.bottom + this.gap,
      above: box.top - this.gap,
      title,
      keys,
    };
  }

  /**
   * Where to stand in reality.
   *
   * Computed HERE rather than in the component, for two reasons. The first: this is
   * arithmetic, and it can be checked by a test rather than by eye. The second: for a
   * button in the bottom right corner both coordinates miss at once — the tooltip runs
   * into the right edge, collapses into a column and slides off the bottom. So both
   * have to be decided together.
   */
  place(spot: TipSpot, tip: TipBox, view: TipBox): { left: number; top: number } {
    if (view.width <= 0 || view.height <= 0) return { left: spot.x, top: spot.y };
    const left = Math.max(this.edge, Math.min(spot.x, view.width - tip.width - this.edge));
    const below = spot.y;
    const fits = below + tip.height <= view.height - this.edge;
    const top = fits ? below : Math.max(this.edge, spot.above - tip.height);
    return { left, top };
  }

  hide(): void {
    this.spot.value = null;
  }
}
