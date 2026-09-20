import type { Ide, Project, ProjectResource } from '@mosetta/ide-api/server';
import { LspServer } from './lsp-server.js';
import { LSP_DEFAULTS } from './settings.js';
import { Toolchain } from './toolchain.js';
import type { Diagnostic, FileDiagnostics, LspStatus } from './types.js';

/**
 * ONE project's language servers.
 *
 * A project resource (`project.use`): created on `onProject`, dying with the project.
 * What happens inside reaches the tabs as the plugin's events — `status` and
 * `diagnostics`; the core carries them in an envelope and does not look inside.
 */
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

  /**
   * Bring every enabled server up. Requirement five: when the project opens rather than
   * on the first `.ts` file — called from `onProject`.
   */
  start(): void {
    const lsp = this.project.settings('lsp', LSP_DEFAULTS);
    for (const [name, settings] of Object.entries(lsp.servers)) {
      if (!settings.enabled) continue;
      const preferences = this.toolchain.preferencesFor(lsp, name);
      if (Object.keys(preferences).length > 0) {
        this.ide.log.info(`${name}: the settings — ${Object.keys(preferences).join(', ')}`);
      }
      const server = new LspServer(
        name,
        { ...settings, preferences },
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

  /**
   * Sweep the whole project once the server is up.
   *
   * In the background and without waiting: opening a project has no right to wait for
   * three hundred files to be checked. Directories outside the walk are skipped by the
   * same table the tree uses — there is no point checking `node_modules`, and nothing
   * to check it with.
   */
  private async checkProject(server: LspServer): Promise<void> {
    const { checkProject, memoryBudgetMb } = this.project.settings('lsp', LSP_DEFAULTS);
    if (!checkProject) return;
    const skipped = new Set(this.project.settings('fs', { noScan: [] as string[] }).noScan);
    const skip = (key: string): boolean => key.split('/').some((part) => skipped.has(part));
    try {
      await server.checkProject(skip, memoryBudgetMb);
    } catch (err) {
      this.ide.log.warn(`the project sweep did not reach the end: ${String(err)}`);
    }
  }

  /** The server responsible for this file. `null` means the language is unknown to us. */
  for(key: string): LspServer | null {
    return this.servers.find((server) => server.handles(key)) ?? null;
  }

  /** The same, but with a comprehensible error instead of `null` for the caller. */
  require(key: string): LspServer {
    const server = this.for(key);
    if (!server) throw new Error(`No language server for ${key}`);
    return server;
  }

  statuses(): LspStatus[] {
    return this.servers.map((server) => server.status());
  }

  diagnosticsFor(key: string): Diagnostic[] {
    return this.for(key)?.diagnosticsFor(key) ?? [];
  }

  /** What the servers already know about the project's errors. */
  known(): FileDiagnostics[] {
    return this.servers.flatMap((server) => server.knownDiagnostics());
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    for (const server of this.servers.splice(0)) server.dispose();
  }
}
