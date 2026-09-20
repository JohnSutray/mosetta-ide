import type { Indexed, Matcher, TextIndex } from '@mosetta/ide-plugin-search';

export interface Hit {
  score: number;
  /** The positions of the matched characters — for highlighting. */
  positions: number[];
}

/** How many parsed names we keep: beyond that it is cheaper to parse afresh. */
const KEEP = 5000;
/**
 * What was typed is the start of the name letter for letter: `get` for `get` rather
 * than for `Get`.
 */
const PREFIX = 20;

/**
 * The match between what was typed and a name — by the "search everywhere" matcher:
 * `gEBI` finds `getElementById`, a word's start is worth more than its middle,
 * consecutive is worth more than scattered. A second matcher would mean a second
 * opinion about a good match, and an IDE should have one opinion.
 *
 * One rule from IDEA on top: the first letter typed lands on the START of a word in the
 * name. `ment` does not find `getElement` — otherwise a list of a thousand global names
 * would answer anything at all.
 */
export class Fuzzy {
  private readonly known = new Map<string, Indexed>();

  /**
   * The matcher and the parsing are fields of the search plugin: there is one opinion
   * about a match.
   */
  constructor(
    private readonly matcher: Pick<Matcher, 'match'>,
    private readonly textIndex: Pick<TextIndex, 'fold' | 'of'>,
  ) {}

  match(query: string, label: string): Hit | null {
    if (query === '') return { score: 0, positions: [] };
    const indexed = this.indexed(label);
    const found = this.matcher.match(indexed, this.textIndex.fold(query));
    if (!found || !indexed.starts[found.positions[0]!]) return null;
    return { score: found.score + (label.startsWith(query) ? PREFIX : 0), positions: found.positions };
  }

  private indexed(label: string): Indexed {
    let indexed = this.known.get(label);
    if (!indexed) {
      if (this.known.size >= KEEP) this.known.clear();
      indexed = this.textIndex.of(label);
      this.known.set(label, indexed);
    }
    return indexed;
  }
}
