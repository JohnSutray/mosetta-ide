import type { Chunk } from '@mosetta/ide-plugin-code';
import type { FileHit } from './grep.js';

/**
 * A piece of a hit row: the colour from the highlighting, and `match` for the match
 * itself.
 */
export interface HitPiece {
  text: string;
  color: string | null;
  match: boolean;
}

/** What to show in a list row: the pieces, and "the start is cut off". */
export interface HitParts {
  pieces: HitPiece[];
  cut: boolean;
}

/**
 * A hit row is CODE, and it should look like code.
 *
 * The project search showed hits in one shade of grey: a list of forty rows was read by
 * letters rather than by shape. We take the same parsing the usage list and the editor
 * use — and over it we mark the match with a BACKING: a colour would end up arguing
 * with the highlighting, and weight rocks the row's width.
 *
 * A class rather than a function: it has real settings from the display window, and the
 * painting arrives as an argument — which means in a test it is a stand-in and what is
 * checked is the slicing itself.
 */
export class HitLine {
  /** How many characters we show left of the match, and right. */
  private readonly lead = 40;
  private readonly trail = 120;
  /**
   * A long line (a minified file) is parsed whole for nothing: a hundred and fifty
   * characters of it are visible. Past this line we parse exactly the display window —
   * the parser works outside the file's context anyway.
   */
  private readonly whole = 4000;

  constructor(private readonly paint: (text: string, path: string) => Chunk[]) {}

  of(hit: FileHit): HitParts {
    const text = hit.text;
    const from = Math.max(0, hit.from - this.lead);
    const to = Math.min(text.length, hit.to + this.trail);
    const long = text.length > this.whole;
    const base = long ? from : 0;
    const chunks = this.chunks(long ? text.slice(from, to) : text, hit.path);

    const pieces: HitPiece[] = [];
    let at = base;
    for (const chunk of chunks) {
      const start = at;
      at += chunk.text.length;
      const left = Math.max(start, from);
      const right = Math.min(at, to);
      if (left >= right) continue;
      for (const [s, e] of this.split(left, right, hit.from, hit.to)) {
        pieces.push({ text: text.slice(s, e), color: chunk.color, match: s >= hit.from && e <= hit.to });
      }
    }
    return { pieces, cut: from > 0 };
  }

  /**
   * The painting's pieces, but only if they AGREE with the text: the parser is somebody
   * else's, and drifting from it in length means showing the wrong backing. Not agreed
   * means we show the row in one colour, which is worse but honest.
   */
  private chunks(text: string, path: string): Chunk[] {
    const painted = this.paint(text, path);
    let length = 0;
    for (const chunk of painted) length += chunk.text.length;
    return length === text.length ? painted : [{ text, color: null }];
  }

  /** Cut [from, to) by the match's boundaries — one to three pieces come out. */
  private split(from: number, to: number, hitFrom: number, hitTo: number): Array<[number, number]> {
    const clamp = (at: number) => Math.min(Math.max(at, from), to);
    const edges: number[] = [from, clamp(hitFrom), clamp(hitTo), to];
    const out: Array<[number, number]> = [];
    for (let i = 0; i < 3; i++) {
      const [left, right] = [edges[i] as number, edges[i + 1] as number];
      if (left < right) out.push([left, right]);
    }
    return out;
  }
}
