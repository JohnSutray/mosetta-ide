import type { WorkspaceInfo } from '@ide/protocol';
import type { ConfigStore } from '../config/store.js';
import { disk } from '../fs/os-fs.js';
import { RpcError } from '../errors.js';
import { journal } from '../log.js';
import { Workspace } from './workspace.js';

const log = journal.logger('workspaces');

export interface RegistryOptions {
  idleMs?: number;
  now?: () => number;
}

export class WorkspaceRegistry {
  private readonly byId = new Map<string, Workspace>();
  private readonly byRoot = new Map<string, Workspace>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly listeners = new Set<(list: WorkspaceInfo[]) => void>();
  private readonly openers = new Set<(ws: Workspace) => void>();
  private readonly idleMs: number;

  constructor(
    private readonly config: ConfigStore,
    options: RegistryOptions = {},
  ) {
    this.idleMs = options.idleMs ?? 15 * 60_000;
  }

  async open(rootInput: string): Promise<Workspace> {
    const real = await disk.probeRoot(rootInput);

    const existing = this.byRoot.get(real);
    if (existing) {
      this.cancelDispose(existing);
      return existing;
    }

    const ws = new Workspace(real, this.config);
    this.byRoot.set(real, ws);
    this.byId.set(ws.id, ws);
    log.info(`открыт ${real} (${ws.id})`);
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

  onOpen(listener: (ws: Workspace) => void): () => void {
    this.openers.add(listener);
    return () => this.openers.delete(listener);
  }

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
