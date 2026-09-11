import { signal } from '@preact/signals';
import type { Bounds } from '@ide/api/client';

export class TreeMenuState {
  readonly open = signal<{ path: string; isDir: boolean; x: number; y: number } | null>(null);

  private readonly width = 210;
  private readonly height = 240;

  constructor(private readonly bounds: () => Bounds) {}

  show(path: string, isDir: boolean, x: number, y: number): void {
    const edge = this.bounds();
    this.open.value = {
      path,
      isDir,
      x: Math.min(x, Math.max(edge.left + 8, edge.right - this.width)),
      y: Math.min(y, Math.max(edge.top + 8, edge.bottom - this.height)),
    };
  }

  close(): void {
    this.open.value = null;
  }
}
