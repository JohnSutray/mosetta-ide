
let ratio = 1;

export class PixelGrid {
  setRatio(value: number): void {
    ratio = value > 0 ? value : 1;
  }

  snap(value: number, at = ratio): number {
    return Math.round(value * at) / at;
  }

  cell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const left = this.snap(x);
    const top = this.snap(y);
    ctx.fillRect(left, top, this.snap(x + w) - left, this.snap(y + h) - top);
  }
}

export const pixelGrid = new PixelGrid();
