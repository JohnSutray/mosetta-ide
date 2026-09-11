export class LegacyNames {
  private readonly oldScope = '@ide/';
  private readonly newPrefix = '@mosetta/ide-';

  legacyOf(name: string): string | null {
    if (!name.startsWith(this.newPrefix)) return null;
    const rest = name.slice(this.newPrefix.length);
    if (rest === 'plugin-ui') return `${this.oldScope}ui`;
    return this.oldScope + rest;
  }

  currentOf(old: string): string | null {
    if (!old.startsWith(this.oldScope)) return null;
    const rest = old.slice(this.oldScope.length);
    return rest === 'ui' ? `${this.newPrefix}plugin-ui` : this.newPrefix + rest;
  }
}

export const legacyNames = new LegacyNames();
