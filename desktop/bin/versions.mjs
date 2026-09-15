import fs from 'node:fs';
import path from 'node:path';

export class Versions {
  constructor(apps) {
    this.apps = apps;
  }

  installed() {
    let names;
    try {
      names = fs.readdirSync(this.apps, { withFileTypes: true });
    } catch {
      return [];
    }
    return names
      .filter((entry) => entry.name !== 'current' && (entry.isDirectory() || entry.isSymbolicLink()))
      .map((entry) => entry.name);
  }

  currentName(link) {
    try {
      return path.basename(fs.readlinkSync(link));
    } catch {
      return null;
    }
  }

  doomed(installed, keep) {
    const kept = new Set(keep.filter((name) => name !== null && name !== undefined));
    return installed.filter((name) => !kept.has(name));
  }

  prune(keep) {
    const removed = [];
    for (const name of this.doomed(this.installed(), keep)) {
      const dir = path.join(this.apps, name);
      const bytes = this.sizeOf(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push({ name, bytes });
    }
    return removed;
  }

  sizeOf(dir) {
    let total = 0;
    const walk = (at) => {
      let entries;
      try {
        entries = fs.readdirSync(at, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(at, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) walk(full);
        else {
          try {
            total += fs.statSync(full).size;
          } catch {}
        }
      }
    };
    walk(dir);
    return total;
  }

  static megabytes(bytes) {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
  }
}
