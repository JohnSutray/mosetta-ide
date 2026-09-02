import type { Diagnostic, LspStatus } from '@ide/protocol';
import type { ConfigStore } from '../config/store.js';
import { OsFs } from '../fs/os-fs.js';
import { OsWatcher } from '../fs/watcher.js';
import { RamFs } from '../fs/ram-fs.js';
import { SearchIndex } from '../search/search-index.js';
import type { FindProviders } from '../search/providers.js';
import { LspServer } from '../lsp/server.js';
import { GitIndex } from '../git/git-index.js';
import { MergeSessions } from '../merge/sessions.js';
import { conflicts, type FsConflicts } from './conflicts.js';
import { tools } from '../env/tools.js';
import type { Logger } from '../log.js';
import type { Workspace } from './workspace.js';

export class Services {
  readonly os: OsFs;
  readonly ram: RamFs;
  readonly index: SearchIndex;
  readonly watcher: OsWatcher;
  readonly git: GitIndex;
  readonly merge = new MergeSessions();
  readonly conflicts: FsConflicts;
  readonly lsp: LspServer[] = [];

  private readonly offs: Array<() => void> = [];
  private booted = false;

  constructor(
    private readonly ws: Workspace,
    private readonly config: ConfigStore,
    private readonly log: Logger,
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
            this.git.touch();
            break;
          case 'doc.external':
            ws.broadcast('doc.external', { path: event.path, revision: event.revision });
            break;
          case 'doc.diverged':
            ws.broadcast('doc.diverged', { path: event.path, reason: event.reason });
            break;
          case 'tree.changed':
            ws.broadcast('tree.changed', { path: event.path });
            this.git.touch();
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

    this.git = new GitIndex(
      ws.root,
      log,
      (state) => ws.broadcast('git.state', state),
      (action, chunk) => ws.broadcast('git.output', { action, chunk }),
    );

    this.offs.push(
      config.onChange((bundle) => {
        this.os.applySettings(bundle.settings.fs);
        this.ram.applySettings(bundle.settings.fs);
        this.index.applySettings(bundle.settings.index);
        this.watcher.applySettings(bundle.settings.fs);
        this.git.startAutoFetch(bundle.settings.git.autoFetchMinutes);
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

    this.git.start();
    this.git.startAutoFetch(this.config.settings.git.autoFetchMinutes);

    if (this.config.settings.lsp.startOnOpen) this.startLanguageServers();
  }

  private async checkProject(server: LspServer): Promise<void> {
    const { checkProject, checkProjectLimit } = this.config.settings.lsp;
    if (!checkProject) return;
    const skipped = new Set(this.config.settings.fs.noScan);
    const skip = (key: string): boolean =>
      key.split('/').some((part) => skipped.has(part));
    try {
      await server.checkProject(skip, checkProjectLimit);
    } catch (err) {
      this.log.warn(`обход проекта не дошёл до конца: ${String(err)}`);
    }
  }

  private async primeManifests(): Promise<void> {
    for (const file of this.ram.files()) {
      if (!file.path.endsWith('package.json')) continue;
      await this.ram.peekDoc(file.path).catch(() => undefined);
    }
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
      void server.start().then(() => this.checkProject(server));
    }
  }

  packageManager(): string {
    const chosen = this.config.settings.tools.packageManager.trim();
    return chosen === '' ? this.suggestedManager() : chosen;
  }

  suggestedManager(): string {
    const top = this.ram.listSync('') ?? [];
    const names = new Set(top.map((entry) => entry.name));
    return tools.packageManager((file) => names.has(file));
  }

  lspFor(key: string): LspServer | null {
    return this.lsp.find((server) => server.handles(key)) ?? null;
  }

  statuses(): LspStatus[] {
    return this.lsp.map((server) => server.status());
  }

  knownDiagnostics(): Array<{ path: string; diagnostics: Diagnostic[] }> {
    return this.lsp.flatMap((server) => server.knownDiagnostics());
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.merge.dispose();
    this.git.dispose();
    this.watcher.dispose();
    for (const server of this.lsp.splice(0)) server.dispose();
    this.index.dispose();
    this.ram.dispose();
  }
}
