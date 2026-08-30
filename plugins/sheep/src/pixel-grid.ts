
let ratio = 1;

export function setPixelRatio(value: number): void {
  ratio = value > 0 ? value : 1;
}

export function snap(value: number, at = ratio): number {
  return Math.round(value * at) / at;
}

export function cell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const left = snap(x);
  const top = snap(y);
  ctx.fillRect(left, top, snap(x + w) - left, snap(y + h) - top);
}
