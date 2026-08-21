import type { LspStatus } from '@ide/protocol';
import type { ConfigStore } from '../config/store.js';
import { OsFs } from '../fs/os-fs.js';
import { OsWatcher } from '../fs/watcher.js';
import { RamFs } from '../fs/ram-fs.js';
import { SearchIndex } from '../search/search-index.js';
import { LspServer } from '../lsp/server.js';
import { TerminalHost } from '../term/host.js';
import { GitIndex } from '../git/git-index.js';
import { packageManager } from '../env/shell.js';
import type { Logger } from '../log.js';
import type { Workspace } from './workspace.js';

export class Services {
  readonly os: OsFs;
  readonly ram: RamFs;
  readonly index: SearchIndex;
  readonly watcher: OsWatcher;
  readonly terminals: TerminalHost;
  readonly git: GitIndex;
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
          case 'doc.saved':
            this.git.touch();
            break;
          case 'doc.external':
            ws.broadcast('doc.external', { path: event.path, revision: event.revision });
            break;
          case 'doc.conflict':
            ws.broadcast('doc.conflict', { path: event.path });
            break;
          case 'tree.changed':
            ws.broadcast('tree.changed', { path: event.path });
            this.git.touch();
            break;
          case 'doc.removed':
            ws.broadcast('doc.removed', { path: event.path });
            break;
          default:
            break;
        }
      }),
    );

    this.git = new GitIndex(
      ws.root,
      log,
      (state) => ws.broadcast('git.state', state),
      (action, chunk) => ws.broadcast('git.output', { action, chunk }),
    );

    this.terminals = new TerminalHost((reason) => ws.hold(reason), log);
    this.offs.push(
      this.terminals.on((event) => {
        switch (event.type) {
          case 'data':
            ws.broadcast('term.data', { name: event.name, data: event.data });
            break;
          case 'exit':
            ws.broadcast('term.exit', { name: event.name, exitCode: event.exitCode });
            break;
          case 'list':
            ws.broadcast('term.list', this.terminals.list());
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

    await this.primeManifests();

    if (this.config.settings.index.enabled) this.index.rebuild();

    if (watching) this.watcher.release();

    void this.ram.preload().then(() => {
      if (this.config.settings.index.enabled) return this.index.indexSymbols();
      return undefined;
    });

    this.git.start();

    if (this.config.settings.lsp.startOnOpen) this.startLanguageServers();
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
      void server.start();
    }
  }

  openTerminal(options: {
    name: string;
    kind?: 'manual' | 'script';
    command?: string;
    cwd?: string;
    cols?: number;
    rows?: number;
  }) {
    const { cwd, ...rest } = options;
    return this.terminals.open({
      ...rest,
      cwd: cwd ? this.ws.resolve(cwd) : this.ws.root,
    });
  }

  createTerminal(options: { cols?: number; rows?: number }) {
    return this.terminals.create({ ...options, cwd: this.ws.root });
  }

  packageManager(): string {
    const top = this.ram.listSync('') ?? [];
    const names = new Set(top.map((entry) => entry.name));
    return packageManager((file) => names.has(file));
  }

  lspFor(key: string): LspServer | null {
    return this.lsp.find((server) => server.handles(key)) ?? null;
  }

  statuses(): LspStatus[] {
    return this.lsp.map((server) => server.status());
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.terminals.dispose();
    this.git.dispose();
    this.watcher.dispose();
    for (const server of this.lsp.splice(0)) server.dispose();
    this.index.dispose();
    this.ram.dispose();
  }
}
