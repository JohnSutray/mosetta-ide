import type { KeyHost, KeyOs, KeyScope } from './types.js';

export class Scopes {
  readonly hosts: readonly KeyHost[] = ['browser', 'electron'];
  readonly oses: readonly KeyOs[] = ['mac', 'win', 'linux'];

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

  empty(cells: Record<KeyHost, KeyOs[]>): boolean {
    return this.hosts.every((host) => cells[host].length === 0);
  }

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

export const scopes = new Scopes();
