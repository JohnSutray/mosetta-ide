import type { Ide, Project, ProjectResource } from '@ide/api/server';
import { LspServer } from './lsp-server.js';
import { Toolchain } from './toolchain.js';
import type { Diagnostic, FileDiagnostics, LspStatus } from './types.js';

export class LspHost implements ProjectResource {
  private readonly servers: LspServer[] = [];
  private readonly offs: Array<() => void> = [];
  private readonly toolchain: Toolchain;

  constructor(
    private readonly project: Project,
    private readonly ide: Ide,
  ) {
    this.toolchain = new Toolchain(ide.dir);
  }

  start(): void {
    const { servers } = this.ide.settings().lsp;
    for (const [name, settings] of Object.entries(servers)) {
      if (!settings.enabled) continue;
      const server = new LspServer(
        name,
        settings,
        this.project.root,
        this.project.memory,
        (ask) => this.project.start(ask),
        this.toolchain,
        this.ide.log,
      );
      this.servers.push(server);
      this.offs.push(
        server.on((event) => {
          if (event.type === 'status') this.project.emit('status', event.status);
          else this.project.emit('diagnostics', { path: event.path, diagnostics: event.diagnostics });
        }),
      );
      this.offs.push(this.project.hold(`lsp:${name}`));
      void server.start().then(() => this.checkProject(server));
    }
  }

  private async checkProject(server: LspServer): Promise<void> {
    const settings = this.ide.settings();
    const { checkProject, checkProjectLimit } = settings.lsp;
    if (!checkProject) return;
    const skipped = new Set(settings.fs.noScan);
    const skip = (key: string): boolean => key.split('/').some((part) => skipped.has(part));
    try {
      await server.checkProject(skip, checkProjectLimit);
    } catch (err) {
      this.ide.log.warn(`обход проекта не дошёл до конца: ${String(err)}`);
    }
  }

  for(key: string): LspServer | null {
    return this.servers.find((server) => server.handles(key)) ?? null;
  }

  require(key: string): LspServer {
    const server = this.for(key);
    if (!server) throw new Error(`Нет языкового сервера для ${key}`);
    return server;
  }

  statuses(): LspStatus[] {
    return this.servers.map((server) => server.status());
  }

  diagnosticsFor(key: string): Diagnostic[] {
    return this.for(key)?.diagnosticsFor(key) ?? [];
  }

  known(): FileDiagnostics[] {
    return this.servers.flatMap((server) => server.knownDiagnostics());
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    for (const server of this.servers.splice(0)) server.dispose();
  }
}
