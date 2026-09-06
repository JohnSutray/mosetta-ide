import type { ConfigStore } from '../config/store.js';
import { OsFs } from '../fs/os-fs.js';
import { OsWatcher } from '../fs/watcher.js';
import { RamFs } from '../fs/ram-fs.js';
import { SearchIndex } from '../search/search-index.js';
import type { FindProviders } from '../search/providers.js';
import { MergeSessions } from '../merge/sessions.js';
import { conflicts, type FsConflicts } from './conflicts.js';
import type { Logger } from '../log.js';
import type { Workspace } from './workspace.js';

export class Services {
  readonly os: OsFs;
  readonly ram: RamFs;
  readonly index: SearchIndex;
  readonly watcher: OsWatcher;
  readonly merge = new MergeSessions();
  readonly conflicts: FsConflicts;

  private readonly offs: Array<() => void> = [];
  private booted = false;

  constructor(
    ws: Workspace,
    private readonly config: ConfigStore,
    log: Logger,
    finds: FindProviders,
  ) {
    const settings = config.settings;
    this.os = new OsFs(ws.root, settings.fs);
    this.ram = new RamFs(this.os, settings.fs, log);
    this.index = new SearchIndex(this.ram, settings.index, log, finds);
    this.watcher = new OsWatcher(
      ws.root,
      settings.fs,
      (keys) => void this.ram.syncFromDisk(keys),
      log,
      { debounceMs: settings.fs.watchDebounceMs },
    );

    this.offs.push(
      this.ram.on((event) => {
        switch (event.type) {
          case 'doc.changed':
            ws.broadcast('doc.changed', {
              path: event.path,
              version: event.version,
              dirty: event.dirty,
            });
            break;
          case 'doc.saved':
            break;
          case 'doc.external':
            ws.broadcast('doc.external', { path: event.path, revision: event.revision });
            break;
          case 'doc.diverged':
            ws.broadcast('doc.diverged', { path: event.path, reason: event.reason });
            break;
          case 'tree.changed':
            ws.broadcast('tree.changed', { path: event.path });
            break;
          case 'doc.removed':
            ws.broadcast('doc.removed', { path: event.path });
            break;
          case 'doc.moved':
            ws.broadcast('doc.moved', { from: event.from, path: event.path });
            break;
          default:
            break;
        }
      }),
    );

    this.offs.push(this.merge.on((state) => ws.broadcast('merge.state', state)));
    this.conflicts = conflicts.watch(this.ram, this.os, this.merge, log);
    this.offs.push(() => this.conflicts.off());

    this.offs.push(
      config.onChange((bundle) => {
        this.os.applySettings(bundle.settings.fs);
        this.ram.applySettings(bundle.settings.fs);
        this.index.applySettings(bundle.settings.index);
        this.watcher.applySettings(bundle.settings.fs);
      }),
    );
  }

  async boot(): Promise<void> {
    if (this.booted) return;
    this.booted = true;

    const watching = this.config.settings.fs.watch;
    if (watching) this.watcher.start();

    await this.ram.prime();

    await this.primeManifests();

    if (this.config.settings.index.enabled) this.index.rebuild();

    if (watching) this.watcher.release();

    void this.ram.preload().then(() => {
      if (this.config.settings.index.enabled) return this.index.indexSymbols();
      return undefined;
    });
  }

  private async primeManifests(): Promise<void> {
    for (const file of this.ram.files()) {
      if (!file.path.endsWith('package.json')) continue;
      await this.ram.peekDoc(file.path).catch(() => undefined);
    }
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.merge.dispose();
    this.watcher.dispose();
    this.index.dispose();
    this.ram.dispose();
  }
}
