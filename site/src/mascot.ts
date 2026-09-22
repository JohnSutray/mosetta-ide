import { cellsOf, SHEEP_BODY, SHEEP_H, SHEEP_LEGS, SHEEP_W } from '../../client/src/ui/sheep-art.js';

/**
 * The mascot beside the title: the IDE's own sheep, walking.
 *
 * The sprite comes from the client's `sheep-art` rather than from a copy: the sheep on
 * the splash screen, the sheep in an empty editor and the sheep on this page are one
 * animal, and a copy would let them drift apart. Two rows of legs, one shown at a time,
 * make the step; the body bobs a pixel; the whole thing walks across its strip of grass
 * and turns around at the ends.
 */
const PX = 11;

function rects(cells: Array<{ x: number; y: number; color: string }>): string {
  return cells
    .map((cell) => `<rect x="${cell.x}" y="${cell.y}" width="1" height="1" fill="${cell.color}"/>`)
    .join('');
}

export function mascot(): string {
  const body = rects(cellsOf(SHEEP_BODY));
  const legs = SHEEP_LEGS.map((phase) => rects(cellsOf([phase], SHEEP_BODY.length)));
  return `
    <div class="mascot" aria-hidden="true">
      <div class="mascot-walk">
        <svg class="mascot-sheep" width="${SHEEP_W * PX}" height="${SHEEP_H * PX}" viewBox="0 0 ${SHEEP_W} ${SHEEP_H}" shape-rendering="crispEdges">
          <g class="mascot-body">${body}</g>
          <g class="mascot-legs mascot-legs-0">${legs[0]}</g>
          <g class="mascot-legs mascot-legs-1">${legs[1]}</g>
        </svg>
      </div>
      <div class="mascot-grass"></div>
    </div>
  `;
}
