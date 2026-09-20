

export class Jsonc {
  /**
   * JSON with comments. A config is edited by hand, and the explanation of "why this
   * way" has to lie next to the value — otherwise in a month nobody remembers what put
   * `eln-cache` into `noScan`.
   *
   * Parsed by scanning rather than by a regular expression: a `//` inside a string (in
   * a path, say, or a URL) is not a comment.
   */
  parse<T>(text: string, source: string): T {
    try {
      return JSON.parse(stripComments(text)) as T;
    } catch (err) {
      throw new SyntaxError(`${source}: ${err instanceof Error ? err.message : String(err)}`);
    }

    function stripComments(input: string): string {
      let out = '';
      let i = 0;
      let inString = false;
      while (i < input.length) {
        const ch = input[i]!;
        if (inString) {
          out += ch;
          if (ch === '\\') {
            out += input[i + 1] ?? '';
            i += 2;
            continue;
          }
          if (ch === '"') inString = false;
          i += 1;
          continue;
        }
        if (ch === '"') {
          inString = true;
          out += ch;
          i += 1;
          continue;
        }
        if (ch === '/' && input[i + 1] === '/') {
          while (i < input.length && input[i] !== '\n') i += 1;
          continue;
        }
        if (ch === '/' && input[i + 1] === '*') {
          i += 2;
          while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
          i += 2;
          continue;
        }
        if (ch === '}' || ch === ']') {
          out = out.replace(/,\s*$/, '');
        }
        out += ch;
        i += 1;
      }
      return out;
    }
  }

  describeParseFailure(err: unknown, source: string): string {
    const message = err instanceof Error ? err.message : String(err);
    return `${source}: ${message}`;
  }
}

/** One per process. */
export const jsonc = new Jsonc();
