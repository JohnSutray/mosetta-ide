import type { Indexed } from './text.js';

/**
 * Fuzzy search with a score.
 *
 * A query is a subsequence of characters; the value of a subsequence is determined by
 * WHERE it landed. A match at a word's start is worth more than one in the middle,
 * consecutive characters more than scattered ones, a whole word more than a piece. From
 * those three rules it follows that `dccf` finds `DesktopCreditCardForm`: four
 * characters land on four word beginnings.
 *
 * Ours rather than a ready library, for exactly the reason the whole project was
 * started: tuning the rules here means editing the constants below rather than fighting
 * somebody else's opinion about what a good result is.
 */

const MATCH = 16;
const WORD_START = 20;
const CONSECUTIVE = 14;
const AT_ORIGIN = 10;
const WHOLE_WORD = 25;
/** For every character skipped between the first and the last match. */
const SPREAD = 2;

export interface Match {
  /** More is better. */
  score: number;
  /** The positions of the matched characters in the original string. */
  positions: number[];
}

/**
 * A dynamic-programming layer: where the query's q-th character could land, and at what
 * price.
 */
interface Layer {
  pos: number[];
  score: number[];
  /** The index in the previous layer — the way back. */
  from: number[];
}

/**
 * The positions are sorted and the lists are short — an ordinary walk beats a binary
 * search.
 */
function findPos(layer: Layer, pos: number): number {
  for (let i = layer.pos.length - 1; i >= 0; i -= 1) {
    if (layer.pos[i] === pos) return i;
    if (layer.pos[i]! < pos) return -1;
  }
  return -1;
}

/**
 * A whole word matched — great value: `dev` in `::dev` is what the user was looking
 * for, while `dev` in `deviceRenderer` is a coincidence.
 */
function wholeWordBonus(item: Indexed, positions: number[]): number {
  const { text, starts } = item;
  let bonus = 0;
  let runStart = positions[0]!;

  for (let i = 1; i <= positions.length; i += 1) {
    if (i < positions.length && positions[i] === positions[i - 1]! + 1) continue;
    const runEnd = positions[i - 1]!;
    const after = runEnd + 1;
    const endsWord = after >= text.length || starts[after] === 1;
    if (starts[runStart] === 1 && endsWord) bonus += WHOLE_WORD;
    if (i < positions.length) runStart = positions[i]!;
  }
  return bonus;
}

/** Matching a query against a parsed string. */
export class Matcher {
  /**
   * A quick filter: does such a subsequence exist at all. A cheap walk that throws out
   * almost every candidate before the expensive scoring.
   */
  couldMatch(text: string, query: string): boolean {
    let at = 0;
    for (let q = 0; q < query.length; q += 1) {
      at = text.indexOf(query[q]!, at);
      if (at === -1) return false;
      at += 1;
    }
    return true;
  }

  /**
   * Score a match. The query MUST be folded (`textIndex.fold`: NFC plus lower case) —
   * here it is compared character by character with already folded text.
   *
   * Folding inside is not on: the matcher is called for every hit, and `fold` does a
   * `normalize`, which on twenty thousand entries is no longer pennies. So THE ASKER
   * folds, once per query. The rule cost a day: the commons' sources handed the query
   * over as it was, and any capital letter found nothing — `themeplugin` worked,
   * `ThemePlugin` did not.
   */
  match(item: Indexed, query: string): Match | null {
    const { text, starts } = item;
    if (query.length === 0 || query.length > text.length) return null;
    if (!this.couldMatch(text, query)) return null;

    const base = (at: number, consecutive: boolean): number =>
      MATCH +
      (starts[at] ? WORD_START : 0) +
      (at === 0 ? AT_ORIGIN : 0) +
      (consecutive ? CONSECUTIVE : 0);

    const layers: Layer[] = [];

    for (let q = 0; q < query.length; q += 1) {
      const ch = query[q]!;
      const previous = layers[q - 1];
      const layer: Layer = { pos: [], score: [], from: [] };

      if (!previous) {
        for (let at = text.indexOf(ch); at !== -1; at = text.indexOf(ch, at + 1)) {
          layer.pos.push(at);
          layer.score.push(base(at, false));
          layer.from.push(-1);
        }
      } else {
        let cursor = 0;
        let bestScore = -Infinity;
        let bestIndex = -1;

        for (let at = text.indexOf(ch); at !== -1; at = text.indexOf(ch, at + 1)) {
          while (cursor < previous.pos.length && previous.pos[cursor]! < at) {
            if (previous.score[cursor]! > bestScore) {
              bestScore = previous.score[cursor]!;
              bestIndex = cursor;
            }
            cursor += 1;
          }
          if (bestIndex === -1) continue; 
          let score = bestScore + base(at, false);
          let from = bestIndex;
          const neighbour = findPos(previous, at - 1);
          if (neighbour !== -1) {
            const chained = previous.score[neighbour]! + base(at, true);
            if (chained > score) {
              score = chained;
              from = neighbour;
            }
          }
          layer.pos.push(at);
          layer.score.push(score);
          layer.from.push(from);
        }
      }

      if (layer.pos.length === 0) return null;
      layers.push(layer);
    }

    const last = layers[layers.length - 1]!;
    let bestAt = 0;
    for (let i = 1; i < last.score.length; i += 1) {
      if (last.score[i]! > last.score[bestAt]!) bestAt = i;
    }

    const positions: number[] = new Array(query.length);
    let index = bestAt;
    for (let q = query.length - 1; q >= 0; q -= 1) {
      positions[q] = layers[q]!.pos[index]!;
      index = layers[q]!.from[index]!;
    }

    let score = last.score[bestAt]!;
    const spread = positions[positions.length - 1]! - positions[0]! + 1 - query.length;
    score -= spread * SPREAD;
    score += wholeWordBonus(item, positions);

    return { score, positions };
  }
}

/** One per process. */
export const matcher = new Matcher();
