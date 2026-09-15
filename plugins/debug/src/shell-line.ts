export class ShellLine {
  quote(word: string): string {
    if (word === '') return "''";
    if (/^[\w./:@%=+,-]+$/.test(word)) return word;
    return `'${word.replace(/'/g, `'\\''`)}'`;
  }

  compose(args: readonly string[], env: Readonly<Record<string, string | null | undefined>> = {}): string {
    const pairs = Object.entries(env)
      .filter((pair): pair is [string, string] => typeof pair[1] === 'string')
      .map(([name, value]) => `${name}=${this.quote(value)}`);
    const command = args.map((arg) => this.quote(arg)).join(' ');
    return pairs.length === 0 ? command : `env ${pairs.join(' ')} ${command}`;
  }
}

export const shellLine = new ShellLine();
