import type { Fuzzy } from './fuzzy.js';
import type { ChoiceHistory } from './history.js';
import type { Item } from './types.js';

export interface Ranked {
  item: Item;
  key: string;
  positions: number[];
  score: number;
}

const RANK_STEP = 6;
const DEPRECATED = 40;

export class Ranker {
  constructor(
    private readonly fuzzy: Fuzzy,
    private readonly history: ChoiceHistory,
  ) {}

  rank(items: readonly Item[], query: string, weights: ReadonlyMap<string, number>): Ranked[] {
    const out: Ranked[] = [];
    for (const item of items) {
      const target = item.filter ?? item.label;
      const hit = this.fuzzy.match(query, target);
      if (!hit) continue;
      const score =
        hit.score +
        (weights.get(item.source) ?? 0) +
        this.history.bonus(item.label) -
        (item.rank ?? 0) * RANK_STEP -
        (item.deprecated ? DEPRECATED : 0);
      out.push({ item, key: this.keyOf(item), positions: target === item.label ? hit.positions : [], score });
    }
    return out.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
  }

  keyOf(item: Item): string {
    return `${item.source}|${item.label}|${item.detail ?? ''}`;
  }
}
