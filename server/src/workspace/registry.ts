import fs from 'node:fs/promises';
import type { WorkspaceInfo } from '@ide/protocol';
import { RpcErrorCode } from '@ide/protocol';
import { RpcError } from '../errors.js';
import { logger } from '../log.js';
import { expandRoot } from './paths.js';
import { Workspace } from './workspace.js';

const log = logger('workspaces');

export interface RegistryOptions {
  idleMs?: number;
  now?: () => number;
}

export class WorkspaceRegistry {
  private readonly byId = new Map<string, Workspace>();
  private readonly byRoot = new Map<string, Workspace>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly listeners = new Set<(list: WorkspaceInfo[]) => void>();
  private readonly idleMs: number;

  constructor(options: RegistryOptions = {}) {
    this.idleMs = options.idleMs ?? 15 * 60_000;
  }

  async open(rootInput: string): Promise<Workspace> {
    const expanded = expandRoot(rootInput);
    let real: string;
    try {
      real = await fs.realpath(expanded);
    } catch {
      throw new RpcError(RpcErrorCode.BadRoot, `Путь не существует: ${expanded}`);
    }
    const stat = await fs.stat(real);
    if (!stat.isDirectory()) {
      throw new RpcError(RpcErrorCode.BadRoot, `Не директория: ${real}`);
    }

    const existing = this.byRoot.get(real);
    if (existing) {
      this.cancelDispose(existing);
      return existing;
    }

    const ws = new Workspace(real);
    this.byRoot.set(real, ws);
    this.byId.set(ws.id, ws);
    log.info(`открыт ${real} (${ws.id})`);
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
