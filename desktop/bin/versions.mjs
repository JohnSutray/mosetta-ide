import fs from 'node:fs';
import path from 'node:path';

/**
 * Tidying away old installations.
 *
 * Every version is half a gigabyte of Electron in `~/.mosetta/ide/app/<version>`, and
 * until this they were never deleted: after ten updates, five gigabytes. Keeping the
 * PREVIOUS one makes sense (a way back if the new one does not start), keeping them all
 * does not. The rule: the one being installed stays, and the one `current` pointed at
 * before it; the rest is deleted, and that is said out loud with the size — a silent
 * tidy-up is no better than a silent truncation.
 */
export class Versions {
  constructor(apps) {
    this.apps = apps;
  }

  /** What version directories there are; `current` is a link rather than a version. */
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

  /** Where `current` points — a version's name, or null if there is no link. */
  currentName(link) {
    try {
      return path.basename(fs.readlinkSync(link));
    } catch {
      return null;
    }
  }

  /** What to delete if `keep` stays. The pure part of the rule. */
  doomed(installed, keep) {
    const kept = new Set(keep.filter((name) => name !== null && name !== undefined));
    return installed.filter((name) => !kept.has(name));
  }

  /** Delete everything but `keep`; return what was deleted, with the size in bytes. */
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
