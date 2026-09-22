/**
 * Parsing the search line into TAGS and a TERM.
 *
 * The user's thought: the `ts::` caption in front of a symbol hinted where the hit came
 * from — so the same thing can be TYPED. Words separated by spaces read as indivisible
 * marks, and the last word stays what is being searched for:
 *
 * ```
 * ts function fit tags ts and function, searching for "fit"
 * setting editor tag setting, searching for "editor"
 * ts searching for "ts" — there is no tag yet, the word is last
 * ts<space> tag ts, the term is empty
 * ```
 *
 * The last word does NOT become a tag until a space has been put after it — otherwise
 * typing would turn into flickering: every letter now a tag, now a term, and the
 * results blinking on every keystroke.
 *
 * A tag is not translated, unlike a section's heading: it is TYPED, and one types what
 * one has seen. A translated tag would mean the search line stops working when the
 * language changes.
 */
export class Terms {
  parse(value: string): { tags: string[]; term: string } {
    const words = value.split(/\s+/).filter((one) => one !== '');
    const closed = /\s$/.test(value);
    const term = closed ? '' : (words.pop() ?? '');
    const tags: string[] = [];
    for (const word of words) {
      const tag = word.toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
    }
    return { tags, term };
  }

  /**
   * Whether a hit fits the query's tags.
   *
   * A hit's kind is a tag WITHOUT a declaration: the section names it anyway, and
   * making every source repeat its own name as a list would mean keeping one piece of
   * knowledge in two places. The match is exact (up to case): a tag is typed out to the
   * end — while it is the last word it is a term — so there is nothing to guess on the
   * user's behalf.
   */
  keeps(hit: { kind: string; tags?: string[] }, tags: string[]): boolean {
    if (tags.length === 0) return true;
    const own = [hit.kind, ...(hit.tags ?? [])].map((one) => one.toLowerCase());
    return tags.every((tag) => own.includes(tag));
  }
}

export const terms = new Terms();
