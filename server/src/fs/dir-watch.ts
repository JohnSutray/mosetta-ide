import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../log.js';
import { paths } from '../workspace/paths.js';

export class DirWatch {
  private readonly watchers = new Map<string, fs.FSWatcher>();
  private closed = false;
  private complained = false;

  constructor(
    private readonly root: string,
    private readonly skip: (name: string) => boolean,
    private readonly onPath: (key: string) => void,
    private readonly log: Logger,
  ) {}

  get size(): number {
    return this.watchers.size;
  }

  start(): void {
    this.add('');
  }

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

  private heard(dirKey: string, name: string): void {
    let key: string;
    try {
      key = paths.toKey(paths.joinKey(dirKey, name.split(path.sep).join('/')));
    } catch {
      return;     }
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

  private walk(key: string, absolute: string, announce: boolean): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;     }
    for (const entry of entries) {
      if (this.skip(entry.name)) continue;
      const child = paths.joinKey(key, entry.name);
      if (announce) this.onPath(child);
      if (entry.isDirectory()) this.add(child, announce);
    }
  }

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

  private close(key: string): void {
    const prefix = `${key}/`;
    for (const watched of [...this.watchers.keys()]) {
      if (watched !== key && !watched.startsWith(prefix)) continue;
      this.watchers.get(watched)?.close();
      this.watchers.delete(watched);
    }
  }

  private trouble(key: string, err: unknown): void {
    if (this.complained) return;
    this.complained = true;
    this.log.warn(
      `watching is incomplete: cannot watch ${key === '' ? '<root>' : key} — ${String(err)}. ` +
        'Looks like fs.inotify.max_user_watches is exhausted',
    );
  }
}
