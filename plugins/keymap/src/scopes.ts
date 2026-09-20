import type { KeyHost, KeyOs, KeyScope } from './types.js';

/**
 * A layout row's environments as a "where × on what" grid.
 *
 * In the file this is a list like `["browser:win", "browser:linux", "electron:win",
 * "electron:linux"]` — honest but unreadable: in the window it took up half a line, and
 * understanding "everywhere but the Mac" out of it was only possible by adding it up in
 * your head. Here it is laid out into six cells and folded back COLLAPSING: a whole
 * host in one word, all six as emptiness, that is, "everywhere".
 *
 * Pure logic, hence a test: folding it wrongly means quietly changing the row's
 * meaning.
 */
export class Scopes {
  readonly hosts: readonly KeyHost[] = ['browser', 'electron'];
  readonly oses: readonly KeyOs[] = ['mac', 'win', 'linux'];

  /** Lay it out into cells: empty in the file means all of them. */
  cells(where?: readonly KeyScope[]): Record<KeyHost, KeyOs[]> {
    const out = { browser: [] as KeyOs[], electron: [] as KeyOs[] };
    if (!where || where.length === 0) {
      for (const host of this.hosts) out[host] = [...this.oses];
      return out;
    }
    for (const scope of where) {
      const [host, os] = scope.split(':') as [KeyHost, KeyOs | undefined];
      if (!this.hosts.includes(host)) continue;
      if (!os) out[host] = [...this.oses];
      else if (this.oses.includes(os) && !out[host].includes(os)) out[host].push(os);
    }
    return out;
  }

  /**
   * Fold it back. All six become `undefined`: "everywhere" is written by the absence of
   * the key rather than by an enumeration, or the shipment would swell to twice the
   * size.
   */
  where(cells: Record<KeyHost, KeyOs[]>): KeyScope[] | undefined {
    const out: KeyScope[] = [];
    let full = true;
    for (const host of this.hosts) {
      const own = this.oses.filter((os) => cells[host].includes(os));
      if (own.length === this.oses.length) out.push(host);
      else {
        full = false;
        for (const os of own) out.push(`${host}:${os}` as KeyScope);
      }
    }
    if (full) return undefined;
    return out;
  }

  /** Not a single cell — the row is dead; we do not write such a thing down. */
  empty(cells: Record<KeyHost, KeyOs[]>): boolean {
    return this.hosts.every((host) => cells[host].length === 0);
  }

  /**
   * Short, for the list: an icon per host. A whole host without letters, a part of one
   * with letters; all six are empty, because there is nothing to show for "everywhere".
   */
  summary(where?: readonly KeyScope[]): Array<{ host: KeyHost; oses: KeyOs[]; all: boolean }> {
    if (!where || where.length === 0) return [];
    const cells = this.cells(where);
    const out: Array<{ host: KeyHost; oses: KeyOs[]; all: boolean }> = [];
    for (const host of this.hosts) {
      const own = cells[host];
      if (own.length === 0) continue;
      out.push({ host, oses: own, all: own.length === this.oses.length });
    }
    return out;
  }
}

/** One per plugin: there is no state, and the rule is one. */
export const scopes = new Scopes();
