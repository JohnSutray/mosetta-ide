import type { Diff3, Region, Choice } from './diff3.js';

/**
 * Aligning the three columns.
 *
 * There is one rule: a hunk occupies the same number of rows in EVERY column. Where
 * there are fewer rows, there is a spacer. Otherwise an argument starting on the
 * fortieth line on the left would be on the thirty-eighth on the right, and the eye
 * would be comparing the wrong thing with the wrong thing.
 *
 * The main convenience follows from that rule for free: since every row is the same
 * height and every column the same length, any hunk's position on screen is computed by
 * multiplication — the arrows between the columns need measure nothing in the DOM.
 *
 * The price is that line wrapping in the columns is off: a wrapped line would occupy
 * two cells in one column and one in the others, and all the arithmetic would fall
 * apart. Long lines run off to the side.
 */

export type Lane = 'left' | 'center' | 'right';

/**
 * Where to put empty lines and how many. `line` is which one they come after,
 * zero-based.
 */
export interface Pad {
  /** −1 means "before the first line". */
  line: number;
  rows: number;
}

/** A stripe of colour: one hunk's rows in one column. */
export interface Band {
  /** The stripe's first and last row, zero-based. An empty hunk is `rows: 0`. */
  from: number;
  rows: number;
  region: number;
}

export interface LaneLayout {
  text: string;
  pads: Pad[];
  bands: Band[];
}

/** A hunk's place on screen: everything in ROWS, with the pixels added by the layout. */
export interface Spot {
  region: number;
  /** How many rows are above the hunk. */
  top: number;
  /** The hunk's height in rows. */
  rows: number;
}

export interface Layout {
  left: LaneLayout;
  center: LaneLayout;
  right: LaneLayout;
  spots: Spot[];
  /** The total height in rows — the column of arrows stretches to it. */
  rows: number;
}

export function layout(regions: Region[], choices: Choice[], diff3: Diff3): Layout {
  const lines: Record<Lane, string[]> = { left: [], center: [], right: [] };
  const pads: Record<Lane, Pad[]> = { left: [], center: [], right: [] };
  const bands: Record<Lane, Band[]> = { left: [], center: [], right: [] };
  const spots: Spot[] = [];
  let top = 0;

  regions.forEach((region, at) => {
    const own: Record<Lane, string[]> = {
      left: region.left,
      center: diff3.resultOf(region, choices[at] ?? { left: null, right: null }),
      right: region.right,
    };
    const rows = Math.max(own.left.length, own.center.length, own.right.length);

    for (const lane of ['left', 'center', 'right'] as Lane[]) {
      const mine = own[lane];
      bands[lane].push({ from: lines[lane].length, rows: mine.length, region: at });
      lines[lane].push(...mine);
      const missing = rows - mine.length;
      if (missing > 0) pad(pads[lane], lines[lane].length - 1, missing);
    }

    spots.push({ region: at, top, rows });
    top += rows;
  });

  return {
    left: finish(lines.left, pads.left, bands.left),
    center: finish(lines.center, pads.center, bands.center),
    right: finish(lines.right, pads.right, bands.right),
    spots,
    rows: top,
  };
}

/**
 * An empty column is still ONE row in the editor: an empty document does not exist. So
 * it needs one spacer fewer, otherwise the column ends up longer than its neighbours by
 * exactly that invisible row.
 */
function finish(lines: string[], pads: Pad[], bands: Band[]): LaneLayout {
  if (lines.length === 0 && pads.length > 0) {
    const last = pads[pads.length - 1]!;
    if (last.rows > 1) last.rows -= 1;
    else pads.pop();
  }
  return { text: lines.join('\n'), pads, bands };
}

/** Two spacers in a row on the same line are one spacer. */
function pad(list: Pad[], line: number, rows: number): void {
  const last = list[list.length - 1];
  if (last && last.line === line) last.rows += rows;
  else list.push({ line, rows });
}
