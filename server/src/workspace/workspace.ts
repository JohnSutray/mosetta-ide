import path from 'node:path';
import { createHash } from 'node:crypto';
import type { EventName, EventPayload, WorkspaceInfo } from '@ide/protocol';
import { journal, type Logger } from '../log.js';
import type { ConfigStore } from '../config/store.js';
import { paths } from './paths.js';
import type { Processes } from '../env/processes.js';
import { Services } from './services.js';

export interface WorkspaceResource {
  dispose(): void | Promise<void>;
}

export interface SessionLike {
  readonly id: string;
  notify<E extends EventName>(event: E, payload: EventPayload<E>): void;
}

export class Workspace {
  readonly id: string;
  readonly root: string;
  readonly name: string;
  readonly openedAt = Date.now();
  readonly log: Logger;

  private readonly sessions = new Set<SessionLike>();
  private readonly resources = new Map<string, WorkspaceResource>();
  private readonly holds = new Map<symbol, string>();
  private disposed = false;

  constructor(
    root: string,
    private readonly config: ConfigStore,
    private readonly processes: Pick<Processes, 'killOwned'>,
  ) {
    this.root = root;
    this.name = path.basename(root) || root;
    this.id = createHash('sha256').update(root).digest('hex').slice(0, 12);
    this.log = journal.logger(`ws:${this.name}`);
  }

  resolve(relative: string): string {
    return paths.toAbsolute(this.root, relative);
  }

  get services(): Services {
    return this.use('services', (ws) => new Services(ws, this.config, this.log));
  }

  async boot(): Promise<void> {
    await this.services.boot();
  }

  relative(absolute: string): string {
    return paths.toRelative(this.root, absolute);
  }

  attach(session: SessionLike): void {
    this.sessions.add(session);
  }

  detach(session: SessionLike): void {
    this.sessions.delete(session);
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  broadcast<E extends EventName>(event: E, payload: EventPayload<E>): void {
    for (const session of this.sessions) session.notify(event, payload);
  }

  hold(reason: string): () => void {
    const token = Symbol(reason);
    this.holds.set(token, reason);
    return () => this.holds.delete(token);
  }

  get holdReasons(): string[] {
    return [...new Set(this.holds.values())];
  }

  get idle(): boolean {
    return this.sessions.size === 0 && this.holds.size === 0;
  }

  use<T extends WorkspaceResource>(key: string, create: (ws: Workspace) => T): T {
    if (this.disposed) throw new Error(`Воркспейс ${this.name} уже закрыт`);
    const existing = this.resources.get(key);
    if (existing) return existing as T;
    const created = create(this);
    this.resources.set(key, created);
    return created;
  }

  peek<T extends WorkspaceResource>(key: string): T | undefined {
    return this.resources.get(key) as T | undefined;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.sessions.clear();
    this.holds.clear();
    for (const [key, resource] of [...this.resources].reverse()) {
      try {
        await resource.dispose();
      } catch (err) {
        this.log.error(`ресурс ${key} не закрылся: ${String(err)}`);
      }
    }
    this.resources.clear();
    const orphans = this.processes.killOwned(this.root);
    if (orphans > 0) this.log.warn(`убито осиротевших подпроцессов: ${orphans}`);
    this.log.info('закрыт');
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  info(): WorkspaceInfo {
    return {
      id: this.id,
      root: this.root,
      name: this.name,
      sessions: this.sessions.size,
      held: this.holdReasons,
      openedAt: this.openedAt,
    };
  }
}
