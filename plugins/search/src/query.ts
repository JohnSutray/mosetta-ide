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

  keeps(hit: { kind: string; tags?: string[] }, tags: string[]): boolean {
    if (tags.length === 0) return true;
    const own = [hit.kind, ...(hit.tags ?? [])].map((one) => one.toLowerCase());
    return tags.every((tag) => own.includes(tag));
  }
}

export const terms = new Terms();
