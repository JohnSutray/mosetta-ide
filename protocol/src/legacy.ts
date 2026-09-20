/**
 * Package names as they were before the rebrand: plugins used to live under
 * the `@ide/` scope.
 *
 * A package name is also the address of its data — its state directory on the
 * server, its memory keys in the browser — so the mapping lives here, as one
 * class used by both ends, and exists purely for a one-off migration. Once no
 * old installation is left, the class goes away with it.
 */
export class LegacyNames {
  private readonly oldScope = '@ide/';
  private readonly newPrefix = '@mosetta/ide-';

  /** The package's pre-rebrand name, or `null` if it never had one. */
  legacyOf(name: string): string | null {
    if (!name.startsWith(this.newPrefix)) return null;
    const rest = name.slice(this.newPrefix.length);
    if (rest === 'plugin-ui') return `${this.oldScope}ui`;
    return this.oldScope + rest;
  }

  /** What an old name is called now, or `null` if it is not an old name. */
  currentOf(old: string): string | null {
    if (!old.startsWith(this.oldScope)) return null;
    const rest = old.slice(this.oldScope.length);
    return rest === 'ui' ? `${this.newPrefix}plugin-ui` : this.newPrefix + rest;
  }
}

export const legacyNames = new LegacyNames();
