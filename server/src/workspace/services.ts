import type { LspStatus } from '@ide/protocol';
import type { ConfigStore } from '../config/store.js';
import { OsFs } from '../fs/os-fs.js';
import { OsWatcher } from '../fs/watcher.js';
import { RamFs } from '../fs/ram-fs.js';
import { SearchIndex } from '../search/search-index.js';
import { LspServer } from '../lsp/server.js';
import type { Logger } from '../log.js';
import type { Workspace } from './workspace.js';

export class Services {
  readonly os: OsFs;
  readonly ram: RamFs;
  readonly index: SearchIndex;
  readonly watcher: OsWatcher;
  readonly lsp: LspServer[] = [];

  private readonly offs: Array<() => void> = [];
  private booted = false;

  constructor(
    private readonly ws: Workspace,
    private readonly config: ConfigStore,
    private readonly log: Logger,
  ) {
    const settings = config.settings;
    this.os = new OsFs(ws.root, settings.fs);
    this.ram = new RamFs(this.os, settings.fs, log);
    this.index = new SearchIndex(this.ram, settings.index, log);
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
          case 'doc.external':
            ws.broadcast('doc.external', { path: event.path, revision: event.revision });
            break;
          case 'doc.conflict':
            ws.broadcast('doc.conflict', { path: event.path });
            break;
          case 'tree.changed':
            ws.broadcast('tree.changed', { path: event.path });
            break;
          case 'doc.removed':
            ws.broadcast('doc.removed', { path: event.path });
            break;
          default:
            break;
        }
      }),
    );

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
    if (this.config.settings.index.enabled) this.index.rebuild();

    if (watching) this.watcher.release();

    void this.ram.preload().then(() => {
      if (this.config.settings.index.enabled) return this.index.indexSymbols();
      return undefined;
    });

    if (this.config.settings.lsp.startOnOpen) this.startLanguageServers();
  }

  private startLanguageServers(): void {
    for (const [name, settings] of Object.entries(this.config.settings.lsp.servers)) {
      if (!settings.enabled) continue;
      const server = new LspServer(name, settings, this.ws.root, this.ram, this.log);
      this.lsp.push(server);
      this.offs.push(
        server.on((event) => {
          if (event.type === 'status') {
            this.ws.broadcast('lsp.status', event.status);
          } else {
            this.ws.broadcast('lsp.diagnostics', {
              path: event.path,
              diagnostics: event.diagnostics,
            });
          }
        }),
      );
      const release = this.ws.hold(`lsp:${name}`);
      this.offs.push(release);
      void server.start();
    }
  }

  lspFor(key: string): LspServer | null {
    return this.lsp.find((server) => server.handles(key)) ?? null;
  }

  statuses(): LspStatus[] {
    return this.lsp.map((server) => server.status());
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.watcher.dispose();
    for (const server of this.lsp.splice(0)) server.dispose();
    this.index.dispose();
    this.ram.dispose();
  }
}
