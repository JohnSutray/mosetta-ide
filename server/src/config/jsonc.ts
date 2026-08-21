export function parseJsonc<T>(text: string, source: string): T {
  return JSON.parse(stripComments(text)) as T;

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
      if (ch === ',') {
        let j = i + 1;
        while (j < input.length && /\s/.test(input[j]!)) j += 1;
        if (input[j] === '}' || input[j] === ']') {
          i += 1;
          continue;
        }
      }
      out += ch;
      i += 1;
    }
    return out;
  }
}

export function describeParseFailure(err: unknown, source: string): string {
  const message = err instanceof Error ? err.message : String(err);
  return `${source}: ${message}`;
}
