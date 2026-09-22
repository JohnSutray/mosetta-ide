/**
 * A plugin's stylesheet, fenced in to the IDE's root.
 *
 * Plugins write ordinary global CSS — `.button`, `.panel`, `:root { --bg: … }` — and in
 * a tab of its own that is fine. Mounted into somebody else's page it is not: the theme's
 * `.button` restyled the host's buttons, and its palette on `:root` overwrote the host's
 * variables of the same name. So every rule a plugin hands over is rewritten to hang
 * from the root's class before it reaches the page: `.button` becomes
 * `.mosetta-ide .button`, and `:root`, `html` and `body` become the root itself.
 *
 * Only selectors are rewritten; declaration blocks are copied character for character.
 * Letting the browser parse the sheet and serialise it back was tried first, and it
 * loses declarations: `border: solid var(--fg)` followed by `border-width: …` comes back
 * without the border, because a shorthand holding `var()` cannot be written out once a
 * longhand has overridden part of it. The checkboxes lost their tick that way.
 */
export class CssScope {
  constructor(private readonly root: string) {}

  apply(text: string): string {
    return this.block(text, 0, text.length);
  }

  /** A run of rules, as at the top level or inside `@media { … }`. */
  private block(text: string, from: number, to: number): string {
    let out = '';
    let at = from;
    while (at < to) {
      const open = this.find(text, at, to, '{;');
      if (open < 0) {
        out += text.slice(at, to);
        break;
      }
      const prelude = text.slice(at, open);
      if (text[open] === ';') {
        out += text.slice(at, open + 1);
        at = open + 1;
        continue;
      }
      const close = this.matching(text, open, to);
      const head = prelude.trim();
      if (/^@(media|supports|container|layer|document)\b/i.test(head)) {
        out += `${prelude}{${this.block(text, open + 1, close)}}`;
      } else if (head.startsWith('@')) {
        out += text.slice(at, close + 1);
      } else {
        const lead = prelude.slice(0, prelude.length - prelude.trimStart().length);
        const tail = prelude.slice(prelude.trimEnd().length);
        out += `${lead}${this.selector(head)}${tail}${text.slice(open, close + 1)}`;
      }
      at = close + 1;
    }
    return out;
  }

  /** One selector list: each member moved under the root. */
  selector(list: string): string {
    return split(list)
      .map((one) => {
        const trimmed = one.trim();
        const page = /^(?::root|html|body)(?![\w-])/.exec(trimmed);
        if (page) return this.root + trimmed.slice(page[0].length);
        if (trimmed.startsWith(this.root)) return trimmed;
        return `${this.root} ${trimmed}`;
      })
      .join(', ');
  }

  /** The next of `chars` outside comments and strings, or -1. */
  private find(text: string, from: number, to: number, chars: string): number {
    for (let at = from; at < to; at++) {
      const skip = this.skip(text, at, to);
      if (skip !== at) {
        at = skip - 1;
        continue;
      }
      if (chars.includes(text[at]!)) return at;
    }
    return -1;
  }

  /** The brace closing the one at `open`, counting nested ones. */
  private matching(text: string, open: number, to: number): number {
    let depth = 0;
    for (let at = open; at < to; at++) {
      const skip = this.skip(text, at, to);
      if (skip !== at) {
        at = skip - 1;
        continue;
      }
      if (text[at] === '{') depth += 1;
      else if (text[at] === '}' && --depth === 0) return at;
    }
    return to - 1;
  }

  /** Past a comment or a string starting at `at`; `at` itself when there is none. */
  private skip(text: string, at: number, to: number): number {
    if (text.startsWith('/*', at)) {
      const end = text.indexOf('*/', at + 2);
      return end < 0 ? to : end + 2;
    }
    const quote = text[at];
    if (quote === '"' || quote === "'") {
      for (let i = at + 1; i < to; i++) {
        if (text[i] === '\\') i += 1;
        else if (text[i] === quote) return i + 1;
      }
      return to;
    }
    return at;
  }
}

/** Split a selector list on its top-level commas, not the ones inside `:is(a, b)`. */
function split(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push(list.slice(from, i));
      from = i + 1;
    }
  }
  out.push(list.slice(from));
  return out;
}
