import { signal } from '@preact/signals';

export class TreeMenuState {
  readonly open = signal<{ path: string; isDir: boolean; x: number; y: number } | null>(null);

  private readonly width = 210;
  private readonly height = 240;

  show(path: string, isDir: boolean, x: number, y: number): void {
    this.open.value = {
      path,
      isDir,
      x: Math.min(x, Math.max(8, window.innerWidth - this.width)),
      y: Math.min(y, Math.max(8, window.innerHeight - this.height)),
    };
  }

  close(): void {
    this.open.value = null;
  }
}
