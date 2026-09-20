import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../log.js';
import { paths } from '../workspace/paths.js';

/**
 * Watching BY DIRECTORY — for systems where the OS has no recursive mode of its own.
 *
 * Inotify watches an INODE rather than a name. So our unit of watching is a directory:
 * a directory's contents change while the directory itself stays the same inode, and a
 * file replaced by a rename shows up as an ordinary event about a name. A watch on a
 * file would only survive an edit in place — whereas a rename is how we write ourselves
 * (a temporary file plus `rename`), and so do editors, build tools and `git`.
 *
 * The price is one watch per directory instead of one per file: in this repository, 209
 * against 1272. Directories listed in `noScan` are not walked at all, so `node_modules`
 * costs nothing.
 */
export class DirWatch {
  private readonly watchers = new Map<string, fs.FSWatcher>();
  private closed = false;
  /** About the OS running out of resources we say it ONCE, but we do say it. */
  private complained = false;

  constructor(
    private readonly root: string,
    /** We do not go inside these directories: memory holds none of their contents. */
    private readonly skip: (name: string) => boolean,
    /** "Look here": the path key something happened about. */
    private readonly onPath: (key: string) => void,
    private readonly log: Logger,
  ) {}

  /** How many directories are being watched. Needed by a test and by the health report. */
  get size(): number {
    return this.watchers.size;
  }

  start(): void {
    this.add('');
  }

  /**
   * The `noScan` list changed — the watching has to be rebuilt: a directory that left
   * the ignore list would otherwise have stayed invisible, and one that entered it
   * would have cost us watches for nothing.
   */
  rescan(): void {
    if (this.closed) return;
    const wanted = new Set<string>(['']);
    this.collect('', wanted);
    for (const key of [...this.watchers.keys()]) {
      if (!wanted.has(key)) this.close(key);
    }
    for (const key of wanted) this.add(key);
  }

  dispose(): void {
    this.closed = true;
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
  }

  /**
   * Take a directory under watch and descend into its subdirectories.
   *
   * `announce` means "tell me what you found". A directory that appears AFTER startup
   * gets filled before we have heard about it: `mkdir -p a/b` plus a file inside is
   * three events, of which exactly one reached us, about `a`. So whatever the walk
   * finds is announced upwards, and it is decided there what to do with it. At startup
   * we stay quiet: the memory walk does the same thing.
   */
  private add(key: string, announce = false): void {
    if (this.closed || this.watchers.has(key)) return;
    const absolute = key === '' ? this.root : path.join(this.root, key);
    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(absolute, { persistent: false });
    } catch (err) {
      this.trouble(key, err);
      return;
    }
    this.watchers.set(key, watcher);
    watcher.on('change', (_event, filename) => {
      if (!filename) return;
      const name = typeof filename === 'string' ? filename : filename.toString('utf8');
      this.heard(key, name);
    });
    watcher.on('error', () => this.close(key));
    this.walk(key, absolute, announce);
  }

  /** What happened in the directory `dirKey`, to the name `name`. */
  private heard(dirKey: string, name: string): void {
    let key: string;
    try {
      key = paths.toKey(paths.joinKey(dirKey, name.split(path.sep).join('/')));
    } catch {
      return;
    }
    if (key === '') return;
    this.onPath(key);
    if (this.skip(paths.baseName(key))) return;
    void this.follow(key);
  }

  private async follow(key: string): Promise<void> {
    if (this.closed) return;
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(path.join(this.root, key));
    } catch {
      this.close(key);       return;
    }
    if (stat.isDirectory()) this.add(key, true);
    else this.close(key);
  }

  /** Walk a directory and take its subdirectories under watch. */
  private walk(key: string, absolute: string, announce: boolean): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (this.skip(entry.name)) continue;
      const child = paths.joinKey(key, entry.name);
      if (announce) this.onPath(child);
      if (entry.isDirectory()) this.add(child, announce);
    }
  }

  /** Which directories are supposed to be under watch RIGHT NOW. */
  private collect(key: string, out: Set<string>): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(key === '' ? this.root : path.join(this.root, key), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || this.skip(entry.name)) continue;
      const child = paths.joinKey(key, entry.name);
      out.add(child);
      this.collect(child, out);
    }
  }

  /** Stop watching a directory and everything beneath it. */
  private close(key: string): void {
    const prefix = `${key}/`;
    for (const watched of [...this.watchers.keys()]) {
      if (watched !== key && !watched.startsWith(prefix)) continue;
      this.watchers.get(watched)?.close();
      this.watchers.delete(watched);
    }
  }

  /**
   * Watching a directory did not work out. Most often this is inotify's limit running
   * out — and one may not keep quiet about it: the watching becomes FULL OF HOLES,
   * while it looks like "memory lying for no reason".
   */
  private trouble(key: string, err: unknown): void {
    if (this.complained) return;
    this.complained = true;
    this.log.warn(
      `watching is incomplete: cannot watch ${key === '' ? '<root>' : key} — ${String(err)}. ` +
        'Looks like fs.inotify.max_user_watches is exhausted',
    );
  }
}
