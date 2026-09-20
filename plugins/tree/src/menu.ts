import { signal } from '@preact/signals';
import type { Bounds } from '@mosetta/ide-api/client';

/**
 * The tree's context menu.
 *
 * Screen coordinates rather than a row index: the menu hangs over everything and knows
 * nothing about the tree.
 */
export class TreeMenuState {
  readonly open = signal<{ path: string; isDir: boolean; x: number; y: number } | null>(null);

  /** The menu's approximate size — so that it does not run off the edge of the screen. */
  private readonly width = 210;
  private readonly height = 240;

  /**
   * The IDE's edges in the viewport: the menu is pinned to them rather than to the
   * window.
   */
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
