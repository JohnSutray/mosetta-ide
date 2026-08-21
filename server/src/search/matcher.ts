import type { Indexed } from './text.js';

const MATCH = 16;
const WORD_START = 20;
const CONSECUTIVE = 14;
const AT_ORIGIN = 10;
const WHOLE_WORD = 25;
const SPREAD = 2;

export interface Match {
  score: number;
  positions: number[];
}

export function couldMatch(text: string, query: string): boolean {
  let at = 0;
  for (let q = 0; q < query.length; q += 1) {
    at = text.indexOf(query[q]!, at);
    if (at === -1) return false;
    at += 1;
  }
  return true;
}

interface Layer {
  pos: number[];
  score: number[];
  from: number[];
}

export function match(item: Indexed, query: string): Match | null {
  const { text, starts } = item;
  if (query.length === 0 || query.length > text.length) return null;
  if (!couldMatch(text, query)) return null;

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

function findPos(layer: Layer, pos: number): number {
  for (let i = layer.pos.length - 1; i >= 0; i -= 1) {
    if (layer.pos[i] === pos) return i;
    if (layer.pos[i]! < pos) return -1;
  }
  return -1;
}

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
