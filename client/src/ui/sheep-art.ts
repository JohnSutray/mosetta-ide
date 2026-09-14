
export const SHEEP_BODY = [
  '..wwww..',
  '.wwwwww.',
  'hhwwwwww',
  'hewwwwww',
  '.wwwwww.',
];

export const SHEEP_LEGS = ['.l...l..', '..l.l...'];

export const SHEEP_COLORS: Record<string, string> = {
  w: '#e8e4dc',
  h: '#4a4a4a',
  e: '#0b0b0b',
  l: '#3b3b3b',
};

export interface SheepCell {
  x: number;
  y: number;
  color: string;
}

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

export const SHEEP_W = SHEEP_BODY[0]?.length ?? 0;
export const SHEEP_H = SHEEP_BODY.length + 1;
