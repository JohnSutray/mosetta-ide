/**
 * A grid of physical pixels for pixel graphics.
 *
 * The problem is real and visible only where the screen's scale is fractional: on
 * Windows that is 125% and 150%, i.e. a `devicePixelRatio` of 1.25 and 1.5. The canvas
 * is drawn in CSS pixels and multiplied by that factor — and a cell's edge lands IN THE
 * MIDDLE of a physical pixel. The browser honestly anti-aliases: first cell A is
 * blended with the background, then cell B is blended with the result. At the junction
 * of two neighbouring cells a thin line of another colour is left — the very seam the
 * user saw on the sheep.
 *
 * The cure is to pin the EDGES to whole physical pixels. Then there is nothing to
 * anti-alias: neighbouring cells share exactly the same edge.
 *
 * The factor lives here as a module variable rather than travelling as a parameter
 * through every call: the application has one canvas and many drawing functions, and
 * threading it through all of them would mean changing their signatures for the sake of
 * a number that is the same for everyone.
 */

let ratio = 1;

/** Cells are pinned to physical pixels. */
export class PixelGrid {
  setRatio(value: number): void {
    ratio = value > 0 ? value : 1;
  }

  /** A coordinate pinned to a whole physical pixel. */
  snap(value: number, at = ratio): number {
    return Math.round(value * at) / at;
  }

  /**
   * A cell of a pixel picture. The width is computed FROM THE EDGES rather than pinned
   * separately: otherwise two neighbouring cells could round the same way and leave a
   * gap between them.
   */
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

/** One per plugin: it remembers the screen's scale. */
export const pixelGrid = new PixelGrid();
