import { signal } from '@preact/signals';

export interface TipSpot {
  x: number;
  y: number;
  above: number;
  title: string;
  keys: string[];
}

export interface TipBox {
  width: number;
  height: number;
}

export class Tips {
  readonly spot = signal<TipSpot | null>(null);

  private readonly gap = 6;

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

export const tips = new Tips();
