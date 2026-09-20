import type { WorkspaceInfo } from '@mosetta/ide-protocol';
import type { ConfigStore } from '../config/store.js';
import { disk } from '../fs/os-fs.js';
import { RpcError } from '../errors.js';
import { journal } from '../log.js';
import { Workspace } from './workspace.js';
import type { Processes } from '../env/processes.js';

const log = journal.logger('workspaces');

export interface RegistryOptions {
  /**
   * How long a workspace lives after the last tab leaves. A page reload must not bring
   * the language server and the terminals down, so this is minutes rather than seconds.
   */
  idleMs?: number;
  /** Substituting the timer in tests. */
  now?: () => number;
}

/**
 * Every project the server has open. The key is the real root (after realpath), so one
 * and the same project opened in three tabs is one workspace with three sessions rather
 * than three copies of tsserver.
 */
export class WorkspaceRegistry {
  private readonly byId = new Map<string, Workspace>();
  private readonly byRoot = new Map<string, Workspace>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly listeners = new Set<(list: WorkspaceInfo[]) => void>();
  /** Who to tell that a project came up: the plugins' home. */
  private readonly openers = new Set<(ws: Workspace) => void>();
  private readonly idleMs: number;

  constructor(
    private readonly config: ConfigStore,
    /** The server's process ledger: every workspace receives it. */
    private readonly processes: Pick<Processes, 'killOwned'>,
    options: RegistryOptions = {},
  ) {
    this.idleMs = options.idleMs ?? 15 * 60_000;
  }

  /**
   * Open a project by absolute path. A repeated call for the same path returns the
   * workspace already alive — along with its warm language server.
   */
  async open(rootInput: string): Promise<Workspace> {
    const real = await disk.probeRoot(rootInput);

    const existing = this.byRoot.get(real);
    if (existing) {
      this.cancelDispose(existing);
      return existing;
    }

    const ws = new Workspace(real, this.config, this.processes);
    this.byRoot.set(real, ws);
    this.byId.set(ws.id, ws);
    log.info(`opened ${real} (${ws.id})`);
    await ws.boot();
    for (const opener of this.openers) opener(ws);
    this.announce();
    return ws;
  }

  get(id: string): Workspace | undefined {
    return this.byId.get(id);
  }

  require(id: string): Workspace {
    const ws = this.byId.get(id);
    if (!ws) throw RpcError.unknownWorkspace(id);
    return ws;
  }

  list(): WorkspaceInfo[] {
    return [...this.byId.values()]
      .map((ws) => ws.info())
      .sort((a, b) => b.openedAt - a.openedAt);
  }

  /**
   * A session detached — we start a timer rather than closing at once: the tab may
   * simply have been reloaded. If somebody returns to the workspace during that time,
   * or something takes a hold on it, the timer is cancelled.
   */
  releaseIfIdle(ws: Workspace): void {
    if (!ws.idle || ws.isDisposed) return;
    if (this.timers.has(ws.id)) return;
    const timer = setTimeout(() => {
      this.timers.delete(ws.id);
      if (ws.idle) void this.close(ws.id);
    }, this.idleMs);
    timer.unref?.();
    this.timers.set(ws.id, timer);
  }

  async close(id: string): Promise<void> {
    const ws = this.byId.get(id);
    if (!ws) return;
    this.cancelDispose(ws);
    this.byId.delete(ws.id);
    this.byRoot.delete(ws.root);
    await ws.dispose();
    this.announce();
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.byId.keys()].map((id) => this.close(id)));
  }

  /** The project is open and its layers are up — one may stand on top of them. */
  onOpen(listener: (ws: Workspace) => void): () => void {
    this.openers.add(listener);
    return () => this.openers.delete(listener);
  }

  /**
   * Any change to the list of projects is an event: the toolbar and the project panel
   * stay live.
   */
  onChange(listener: (list: WorkspaceInfo[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  announce(): void {
    const list = this.list();
    for (const listener of this.listeners) listener(list);
  }

  private cancelDispose(ws: Workspace): void {
    const timer = this.timers.get(ws.id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(ws.id);
    }
  }
}
