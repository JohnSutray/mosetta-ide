import type { Chunk } from '@mosetta/ide-plugin-code';
import type { FileHit } from './grep.js';

export interface HitPiece {
  text: string;
  color: string | null;
  match: boolean;
}

export interface HitParts {
  pieces: HitPiece[];
  cut: boolean;
}

export class HitLine {
  private readonly lead = 40;
  private readonly trail = 120;
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

  private chunks(text: string, path: string): Chunk[] {
    const painted = this.paint(text, path);
    let length = 0;
    for (const chunk of painted) length += chunk.text.length;
    return length === text.length ? painted : [{ text, color: null }];
  }

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
