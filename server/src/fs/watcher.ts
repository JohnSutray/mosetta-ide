import fs from 'node:fs';
import path from 'node:path';
import type { FsSettings } from '@ide/protocol';
import type { Logger } from '../log.js';
import { isTempFile } from './os-fs.js';
import { toKey } from '../workspace/paths.js';

export interface WatcherOptions {
  debounceMs?: number;
}

export class OsWatcher {
  private watcher: fs.FSWatcher | null = null;
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
    this.settings = settings;
  }

  start(): void {
    if (this.watcher) return;
    try {
      this.watcher = fs.watch(this.root, { recursive: true, persistent: false });
    } catch (err) {
      this.fail(`не удалось начать слежение: ${String(err)}`);
      return;
    }

    this.watcher.on('change', (_event, filename) => {
      if (!filename) return;
      this.enqueue(typeof filename === 'string' ? filename : filename.toString('utf8'));
    });
    this.watcher.on('error', (err) => this.fail(String(err)));
    this.log.debug('слежу за файловой системой');
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
  }

  get healthy(): boolean {
    return this.watcher !== null && !this.failed;
  }

  private enqueue(raw: string): void {
    let key: string;
    try {
      key = toKey(raw.split(path.sep).join('/'));
    } catch {
      return;
    }
    if (key === '' || this.ignored(key)) return;

    this.pending.add(key);
    if (this.held) return;
    this.schedule();
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

  private ignored(key: string): boolean {
    const segments = key.split('/');
    const name = segments[segments.length - 1] ?? '';
    if (isTempFile(name)) return true;
    if (this.settings.hidden.includes(name)) return true;
    const noScan = new Set(this.settings.noScan);
    return segments.slice(0, -1).some((segment) => noScan.has(segment));
  }

  private fail(message: string): void {
    if (this.failed) return;
    this.failed = true;
    this.log.warn(`слежение за файловой системой выключено — ${message}`);
    this.watcher?.close();
    this.watcher = null;
  }
}
