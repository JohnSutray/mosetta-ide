import { cellsOf, SHEEP_BODY, SHEEP_COLORS, SHEEP_H, SHEEP_LEGS, SHEEP_W } from '../../client/src/ui/sheep-art.js';

/**
 * The mascot beside the title: the IDE's own sheep, wandering on its strip of grass.
 *
 * The sprite comes from the client's `sheep-art` rather than from a copy: the sheep on
 * the splash screen, the sheep in an empty editor and the sheep on this page are one
 * animal, and a copy would let them drift apart.
 *
 * It wanders a little rather than marching: a few steps the way it FACES, a pause, a turn,
 * a few steps back. The sprite faces left, so walking rightwards without turning first
 * made it walk backwards. And it blinks — a pixel of the head's colour laid over the eye,
 * found in the sprite by its letter rather than by remembered coordinates.
 *
 * Animations go on the `svg` ELEMENT, never on a group inside it: inside, a
 * `translateY(-2px)` means two units of the sprite's own grid — a third of the sheep —
 * which tore the legs off the body the first time.
 */
const PX = 11;

function rects(cells: Array<{ x: number; y: number; color: string }>): string {
  return cells
    .map((cell) => `<rect x="${cell.x}" y="${cell.y}" width="1" height="1" fill="${cell.color}"/>`)
    .join('');
}

/** Where the eye is in the sprite, by the letter that draws it. */
function eye(): { x: number; y: number } | null {
  for (let y = 0; y < SHEEP_BODY.length; y += 1) {
    const x = SHEEP_BODY[y]!.indexOf('e');
    if (x >= 0) return { x, y };
  }
  return null;
}

export function mascot(): string {
  const lid = eye();
  return `
    <div class="mascot" aria-hidden="true">
      <div class="mascot-walk">
        <svg class="mascot-sheep" width="${SHEEP_W * PX}" height="${SHEEP_H * PX}" viewBox="0 0 ${SHEEP_W} ${SHEEP_H}" shape-rendering="crispEdges">
          ${rects(cellsOf(SHEEP_BODY))}
          <g class="mascot-legs">${rects(cellsOf([SHEEP_LEGS[0]!], SHEEP_BODY.length))}</g>
          <g class="mascot-legs mascot-legs-1">${rects(cellsOf([SHEEP_LEGS[1]!], SHEEP_BODY.length))}</g>
          ${lid ? `<rect class="mascot-lid" x="${lid.x}" y="${lid.y}" width="1" height="1" fill="${SHEEP_COLORS.h}"/>` : ''}
        </svg>
      </div>
      <div class="mascot-grass"></div>
    </div>
  `;
}
