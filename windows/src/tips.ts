import { signal } from '@preact/signals';

export interface TipSpot {
  x: number;
  y: number;
  title: string;
  keys: string[];
}

export class Tips {
  readonly spot = signal<TipSpot | null>(null);

  private readonly gap = 6;

  show(target: Element, title: string, keys: string[] = []): void {
    const box = target.getBoundingClientRect();
    this.spot.value = { x: box.left, y: box.bottom + this.gap, title, keys };
  }

  hide(): void {
    this.spot.value = null;
  }
}

export const tips = new Tips();
