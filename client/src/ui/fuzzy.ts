
export interface FuzzyHit {
  score: number;
  matches: number[];
}

const WORD_START = 12;
const CONSECUTIVE = 8;
const MATCH = 4;

export function fuzzy(text: string, query: string): FuzzyHit | null {
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
    score += MATCH;
    if (found === previous + 1) score += CONSECUTIVE;
    if (found === 0 || /[^a-z0-9]/.test(hay[found - 1] ?? '')) score += WORD_START;
    matches.push(found);
    previous = found;
    at = found + 1;
  }

  return { score: score - (text.length - needle.length) * 0.1, matches };
}
