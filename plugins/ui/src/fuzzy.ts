/**
 * A fuzzy filter for short lists.
 *
 * The heavy matcher lives on the server: it walks the whole project's index, learns a
 * dictionary and is worth it. Here there is a list of a dozen branches, and dragging
 * the same machinery to the client for its sake would mean tying two ends together for
 * a task a subsequence solves.
 *
 * The rules are simple and predictable: the query's letters have to occur in order; a
 * match at a word's start is worth more than one in the middle; consecutive is worth
 * more than scattered. We return the positions — they get highlighted.
 *
 * A class rather than a function. The weights are its fields: today they are constants,
 * tomorrow they will arrive from the settings, and the callers will not have to be
 * rewritten. As a bonus, a measurement can be hung on a method: "the search feels
 * sluggish" is a question somebody will ask one day.
 */

export interface FuzzyHit {
  score: number;
  matches: number[];
}

export class Fuzzy {
  /** A match at a word's start is worth most of all: that is how one searches by eye. */
  private readonly wordStart = 12;
  /** Consecutive is worth more than scattered. */
  private readonly consecutive = 8;
  private readonly match = 4;

  find(text: string, query: string): FuzzyHit | null {
    const needle = query.trim().toLowerCase();
    if (needle === '') return { score: 0, matches: [] };

    const hay = text.toLowerCase();
    const matches: number[] = [];
    let score = 0;
    let at = 0;
    let previous = -2;

    for (const letter of needle) {
      const found = hay.indexOf(letter, at);
      if (found === -1) return null;
      score += this.match;
      if (found === previous + 1) score += this.consecutive;
      if (found === 0 || /[^a-z0-9]/.test(hay[found - 1] ?? '')) score += this.wordStart;
      matches.push(found);
      previous = found;
      at = found + 1;
    }

    return { score: score - (text.length - needle.length) * 0.1, matches };
  }
}

/** One per tab. */
export const fuzzy = new Fuzzy();
