/**
 * Splitting strings into words — the foundation of the search.
 *
 * The matcher works with words rather than characters: that is exactly why `dccf` finds
 * `DesktopCreditCardForm`. So the search is only as good as we are at seeing word
 * boundaries.
 *
 * Boundaries come in three kinds:
 *
 * * explicit separators: `/`, `.`, `_`, `-`, `:`, `@`;
 * * a change of case: `creditCard`, and also `HTTPServer` → http plus server;
 * * a change between letter and digit: `parseHTML2Text`.
 *
 * And there is a fourth case — `youcanwriteitlikethisanditwillsplititselfintowords` —
 * where there are no boundaries at all. For that there is a dictionary assembled FROM
 * THE PROJECT ITSELF: if `credit`, `card` and `form` have occurred somewhere in the
 * code with explicit boundaries, then the glued-together `creditcardform` will come
 * apart too. We do not carry a ready dictionary — it would not help: half the words in
 * code are not from an English dictionary but from this particular codebase.
 */

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

/**
 * Pieces of the original string, each with its own position. The positions are needed
 * in order to highlight a match in THE SAME string the user sees.
 */
export interface Piece {
  text: string;
  at: number;
}

/**
 * The project's vocabulary: words that have explicit boundaries somewhere in the code.
 *
 * Assembled from the same strings we index. The point is that `creditCardForm` occurs
 * in the project with boundaries while `creditcardform` does not; the first teaches us
 * the words the second comes apart into.
 */
export class Vocabulary {
  private readonly counts = new Map<string, number>();
  /**
   * Words shorter than this do not enter the vocabulary: `is`, `to`, `id` would cut
   * everything into shreds.
   */
  private static readonly MIN = 3;

  /** Feed in a string that words can be learned from. */
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

  /**
   * Take a glued-together piece apart into known words.
   *
   * Dynamic programming over positions: `best[i]` is the best split of the first `i`
   * characters. "Better" means fewer pieces, and on a tie, made of more frequent words.
   * If it does not come apart wholly, we return `null`: a half guess is worse than an
   * honest refusal, because it would shift the word boundaries and spoil the score.
   */
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

/**
 * The string's final representation for searching: the folded text and the marks of
 * word beginnings. The matcher looks only here.
 */
export interface Indexed {
  /** The folded string (NFC plus lower case); its length matches the original's. */
  text: string;
  /** `starts[i]` means a word begins at position i. */
  starts: Uint8Array;
}

/** Splitting a string into pieces for searching. */
export class TextIndex {
  /** One form for comparison: NFC (a Mac hands names over in NFD) and lower case. */
  fold(value: string): string {
    return value.normalize('NFC').toLowerCase();
  }

  /**
   * Split by the explicit rules: separators, case, letter/digit. The vocabulary takes
   * no part here — this is pure mechanics.
   */
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

/** One per process. */
export const textIndex = new TextIndex();
