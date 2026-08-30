import { diff3, type Region, type Choice } from './diff3.js';

export type Lane = 'left' | 'center' | 'right';

export interface Pad {
  line: number;
  rows: number;
}

export interface Band {
  from: number;
  rows: number;
  region: number;
}

export interface LaneLayout {
  text: string;
  pads: Pad[];
  bands: Band[];
}

export interface Spot {
  region: number;
  top: number;
  rows: number;
}

export interface Layout {
  left: LaneLayout;
  center: LaneLayout;
  right: LaneLayout;
  spots: Spot[];
  rows: number;
}

export function layout(regions: Region[], choices: Choice[]): Layout {
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

function finish(lines: string[], pads: Pad[], bands: Band[]): LaneLayout {
  if (lines.length === 0 && pads.length > 0) {
    const last = pads[pads.length - 1]!;
    if (last.rows > 1) last.rows -= 1;
    else pads.pop();
  }
  return { text: lines.join('\n'), pads, bands };
}

function pad(list: Pad[], line: number, rows: number): void {
  const last = list[list.length - 1];
  if (last && last.line === line) last.rows += rows;
  else list.push({ line, rows });
}
