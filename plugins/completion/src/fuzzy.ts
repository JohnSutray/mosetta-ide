import { matcher, textIndex, type Indexed } from '@ide/plugin-search';

export interface Hit {
  score: number;
  positions: number[];
}

const KEEP = 5000;
const PREFIX = 20;

export class Fuzzy {
  private readonly known = new Map<string, Indexed>();

  match(query: string, label: string): Hit | null {
    if (query === '') return { score: 0, positions: [] };
    const indexed = this.indexed(label);
    const found = matcher.match(indexed, textIndex.fold(query));
    if (!found || !indexed.starts[found.positions[0]!]) return null;
    return { score: found.score + (label.startsWith(query) ? PREFIX : 0), positions: found.positions };
  }

  private indexed(label: string): Indexed {
    let indexed = this.known.get(label);
    if (!indexed) {
      if (this.known.size >= KEEP) this.known.clear();
      indexed = textIndex.of(label);
      this.known.set(label, indexed);
    }
    return indexed;
  }
}
