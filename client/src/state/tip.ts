import { signal } from '@preact/signals';

export interface Tip {
  x: number;
  y: number;
  title: string;
  keys: string[];
}

export const tip = signal<Tip | null>(null);

export function showTip(target: Element, title: string, keys: string[] = []): void {
  const box = target.getBoundingClientRect();
  tip.value = { x: box.left, y: box.bottom + 6, title, keys };
}

export function hideTip(): void {
  tip.value = null;
}
