
const SEPARATOR = /[^\p{L}\p{N}]/u;

function isSeparator(ch: string): boolean {
  return SEPARATOR.test(ch);
}

function isUpper(ch: string): boolean {
  return ch.toLowerCase() !== ch;
}

function isLower(ch: string): boolean {
  return ch.toUpperCase() !== ch;
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

export interface Piece {
  text: string;
  at: number;
}

export class Vocabulary {
  private readonly counts = new Map<string, number>();
  private static readonly MIN = 3;

  learn(input: string): void {
    const pieces = textIndex.splitPieces(input);
    if (pieces.length < 2) return;
    for (const piece of pieces) {
      const word = textIndex.fold(piece.text);
      if (word.length < Vocabulary.MIN) continue;
      this.counts.set(word, (this.counts.get(word) ?? 0) + 1);
    }
  }

  has(word: string): boolean {
    return this.counts.has(word);
  }

  get size(): number {
    return this.counts.size;
  }

  segment(token: string, maxPieces = 5): string[] | null {
    const n = token.length;
    if (n < 6 || n > 40) return null;

    type Cell = { pieces: number; weight: number; from: number } | null;
    const best: Cell[] = Array.from({ length: n + 1 }, () => null);
    best[0] = { pieces: 0, weight: 0, from: 0 };

    for (let end = Vocabulary.MIN; end <= n; end += 1) {
      for (let start = 0; start + Vocabulary.MIN <= end; start += 1) {
        const prev = best[start];
        if (!prev || prev.pieces >= maxPieces) continue;
        const word = token.slice(start, end);
        const count = this.counts.get(word);
        if (count === undefined) continue;

        const candidate = {
          pieces: prev.pieces + 1,
          weight: prev.weight + word.length * 10 + Math.min(count, 20),
          from: start,
        };
        const current = best[end];
        if (
          !current ||
          candidate.pieces < current.pieces ||
          (candidate.pieces === current.pieces && candidate.weight > current.weight)
        ) {
          best[end] = candidate;
        }
      }
    }

    const tail = best[n];
    if (!tail || tail.pieces < 2) return null;

    const out: string[] = [];
    let at = n;
    while (at > 0) {
      const cell = best[at]!;
      out.unshift(token.slice(cell.from, at));
      at = cell.from;
    }
    return out;
  }
}

export interface Indexed {
  text: string;
  starts: Uint8Array;
}

export class TextIndex {
  fold(value: string): string {
    return value.normalize('NFC').toLowerCase();
  }

  splitPieces(input: string): Piece[] {
    const pieces: Piece[] = [];
    let start = -1;

    const flush = (end: number) => {
      if (start === -1) return;
      pieces.push({ text: input.slice(start, end), at: start });
      start = -1;
    };

    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i]!;
      if (isSeparator(ch)) {
        flush(i);
        continue;
      }
      if (start === -1) {
        start = i;
        continue;
      }

      const prev = input[i - 1]!;
      const next = input[i + 1];
      const camel = !isUpper(prev) && isUpper(ch);
      const acronymEnd =
        isUpper(prev) && isUpper(ch) && next !== undefined && isLower(next);
      const digitEdge = isDigit(prev) !== isDigit(ch);

      if (camel || acronymEnd || digitEdge) {
        flush(i);
        start = i;
      }
    }
    flush(input.length);
    return pieces;
  }

  of(input: string, vocabulary?: Vocabulary): Indexed {
    const text = this.fold(input);
    const starts = new Uint8Array(text.length);

    for (const piece of this.splitPieces(input)) {
      starts[piece.at] = 1;
      if (!vocabulary) continue;
      const word = this.fold(piece.text);
      if (vocabulary.has(word)) continue;
      const parts = vocabulary.segment(word);
      if (!parts) continue;
      let at = piece.at;
      for (const part of parts) {
        starts[at] = 1;
        at += part.length;
      }
    }

    return { text, starts };
  }
}

export const textIndex = new TextIndex();
