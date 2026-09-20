import fs from 'node:fs';
import path from 'node:path';
import type { FsSettings } from '@mosetta/ide-protocol';
import type { Logger } from '../log.js';
import { DirWatch } from './dir-watch.js';
import { disk } from './os-fs.js';
import { paths } from '../workspace/paths.js';

const NATIVE_RECURSIVE = process.platform === 'darwin' || process.platform === 'win32';

export interface WatcherOptions {
  debounceMs?: number;
}

export class OsWatcher {
  private watcher: fs.FSWatcher | null = null;
  private tree: DirWatch | null = null;
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private readonly debounceMs: number;
  private failed = false;
  private held = true;

  constructor(
    private readonly root: string,
    private settings: FsSettings,
    private readonly onPaths: (keys: string[]) => void,
    private readonly log: Logger,
    options: WatcherOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 60;
  }

  applySettings(settings: FsSettings): void {
    const before = this.settings;
    this.settings = settings;
    const same = this.sameList(before.noScan, settings.noScan) && this.sameList(before.hidden, settings.hidden);
    if (!same) this.tree?.rescan();
  }

  start(): void {
    if (this.watcher || this.tree) return;

    if (!NATIVE_RECURSIVE) {
      this.tree = new DirWatch(
        this.root,
        (name) => this.settings.noScan.includes(name) || this.settings.hidden.includes(name),
        (key) => this.enqueue(key),
        this.log,
      );
      this.tree.start();
      this.log.debug(`watching the filesystem: ${this.tree.size} directories`);
      return;
    }

    try {
      this.watcher = fs.watch(this.root, { recursive: true, persistent: false });
    } catch (err) {
      this.fail(`could not start watching: ${String(err)}`);
      return;
    }

    this.watcher.on('change', (_event, filename) => {
      if (!filename) return;
      this.enqueue(typeof filename === 'string' ? filename : filename.toString('utf8'));
    });
    this.watcher.on('error', (err) => this.fail(String(err)));
    this.log.debug('watching the filesystem');
  }

  release(): void {
    if (!this.held) return;
    this.held = false;
    if (this.pending.size) this.schedule();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
    this.watcher?.close();
    this.watcher = null;
    this.tree?.dispose();
    this.tree = null;
  }

  get healthy(): boolean {
    return (this.watcher !== null || this.tree !== null) && !this.failed;
  }

  private enqueue(raw: string): void {
    let key: string;
    try {
      key = paths.toKey(raw.split(path.sep).join('/'));
    } catch {
      return;     }
    if (key === '' || this.ignored(key)) return;

    this.pending.add(key);
    if (this.held) return;     this.schedule();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const batch = [...this.pending];
      this.pending.clear();
      if (batch.length) this.onPaths(batch);
    }, this.debounceMs);
    this.timer.unref?.();
  }

  private sameList(before: readonly string[], after: readonly string[]): boolean {
    if (before.length !== after.length) return false;
    const had = new Set(before);
    return after.every((name) => had.has(name));
  }

  private ignored(key: string): boolean {
    const segments = key.split('/');
    const name = segments[segments.length - 1] ?? '';
    if (disk.isTempFile(name)) return true;
    if (this.settings.hidden.includes(name)) return true;
    const noScan = new Set(this.settings.noScan);
    return segments.slice(0, -1).some((segment) => noScan.has(segment));
  }

  private fail(message: string): void {
    if (this.failed) return;
    this.failed = true;
    this.log.warn(`filesystem watching is off — ${message}`);
    this.watcher?.close();
    this.watcher = null;
  }
}
