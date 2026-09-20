
/** The body without legs: the legs have two phases and live on a line of their own. */
export const SHEEP_BODY = [
  '..wwww..',
  '.wwwwww.',
  'hhwwwwww',
  'hewwwwww',
  '.wwwwww.',
];

/** Two phases of a step. No more are needed: this is an eight-bit sheep, not a ballet. */
export const SHEEP_LEGS = ['.l...l..', '..l.l...'];

/**
 * The sheep's colours as LITERALS rather than from the palette.
 *
 * The palette is delivered by the theme plugin, and the splash screen lives before it:
 * the theme's variables do not exist yet at that moment. The same reason the frame has
 * fallback colours.
 */
export const SHEEP_COLORS: Record<string, string> = {
  w: '#e8e4dc',
  h: '#4a4a4a',
  e: '#0b0b0b',
  l: '#3b3b3b',
};

/** One filled cell of the sprite: where it stands and what colour it is. */
export interface SheepCell {
  x: number;
  y: number;
  color: string;
}

/**
 * Lay the sprite's rows out into cells. A pure function feeding the markup: drawing a
 * grid of `<rect>` is simpler than erecting a canvas for five rows.
 */
export function cellsOf(art: readonly string[], top = 0): SheepCell[] {
  const out: SheepCell[] = [];
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const key = row[x];
      if (key === undefined || key === '.') continue;
      const color = SHEEP_COLORS[key];
      if (color) out.push({ x, y: y + top, color });
    }
  });
  return out;
}

/** The sprite's width and height in cells: the body plus the row of legs. */
export const SHEEP_W = SHEEP_BODY[0]?.length ?? 0;
export const SHEEP_H = SHEEP_BODY.length + 1;
