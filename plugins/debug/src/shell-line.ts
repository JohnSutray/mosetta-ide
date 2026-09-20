/**
 * A run line for a POSIX shell.
 *
 * The adapter asks for the program to be carried out IN A TERMINAL and hands over the
 * argv and the environment separately. A terminal is the human's live shell, and its
 * environment cannot be changed, so the variables travel IN THE LINE ITSELF through
 * `env`: that way the command works both in a fresh shell and in one already open under
 * that name. The quotes are single, the only kind with which the shell does not touch
 * the contents at all; a single quote inside is written as `'\''`.
 *
 * Windows is deliberately absent here: PowerShell and cmd have rules of their own, and
 * guessing them halfway is worse than honestly not being able to — there the program is
 * started by the adapter and the output travels as events.
 */
export class ShellLine {
  quote(word: string): string {
    if (word === '') return "''";
    if (/^[\w./:@%=+,-]+$/.test(word)) return word;
    return `'${word.replace(/'/g, `'\\''`)}'`;
  }

  /** `env A=1 B=2 node app.js` — the variables BEFORE the command, and nothing else. */
  compose(args: readonly string[], env: Readonly<Record<string, string | null | undefined>> = {}): string {
    const pairs = Object.entries(env)
      .filter((pair): pair is [string, string] => typeof pair[1] === 'string')
      .map(([name, value]) => `${name}=${this.quote(value)}`);
    const command = args.map((arg) => this.quote(arg)).join(' ');
    return pairs.length === 0 ? command : `env ${pairs.join(' ')} ${command}`;
  }
}

export const shellLine = new ShellLine();
