import path from 'node:path';
import { createHash } from 'node:crypto';
import type { EventName, EventPayload, Settings, WorkspaceInfo } from '@mosetta/ide-protocol';
import { journal, type Logger } from '../log.js';
import type { ConfigStore } from '../config/store.js';
import { ProjectConfig } from '../config/project.js';
import { paths } from './paths.js';
import type { Processes } from '../env/processes.js';
import { Services } from './services.js';

/** A workspace subsystem: it has to know how to die. */
export interface WorkspaceResource {
  dispose(): void | Promise<void>;
}

/** The little a workspace knows about a session: where to send notifications. */
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
    /** The server's process ledger: a project's orphans are killed when it closes. */
    private readonly processes: Pick<Processes, 'killOwned'>,
  ) {
    this.root = root;
    this.name = path.basename(root) || root;
    this.id = createHash('sha256').update(root).digest('hex').slice(0, 12);
    this.log = journal.logger(`ws:${this.name}`);
  }

  /** A protocol path to an absolute one, checking that it does not escape the root. */
  resolve(relative: string): string {
    return paths.toAbsolute(this.root, relative);
  }

  /**
   * The project's layer cake. Created once and dying with the workspace; there is
   * nothing here to reach somebody else's tsserver or somebody else's memory with.
   */
  get services(): Services {
    return this.use('services', (ws) => new Services(ws, this.config, this.log));
  }

  /**
   * This project's own settings: its layer over the personal config, with the file
   * inside the repository itself.
   */
  get projectConfig(): ProjectConfig {
    return this.use('project-config', (ws) => new ProjectConfig(ws, this.config));
  }

  /**
   * This project's effective settings: the machine's plus its own layer. Does NOT THROW
   * for a closed workspace: a plugin asks for them from the tail of asynchronous work
   * (a language server's project sweep outlives the closing), and failing there would
   * mean behaving differently from the machine-level `ide.settings`, which always
   * answered.
   */
  get settings(): Settings {
    return this.peek<ProjectConfig>('project-config')?.bundle.settings ?? this.config.settings;
  }

  /**
   * Bring the layers up: the tree into memory, the project config, the contents in the
   * background.
   *
   * The order IS the fix: the project file is read by the project's MEMORY, hence after
   * the tree; and the preload reads its budget from the settings, hence after the
   * project file. While it started inside the services' boot, a project's own preload
   * budget applied every other time — whoever got there first won.
   */
  async boot(): Promise<void> {
    await this.services.boot();
    await this.projectConfig.load();
    const apply = () => this.services.applySettings(this.projectConfig.bundle.settings.fs);
    apply();
    this.offs.push(this.config.onChange(apply), this.projectConfig.onChange(apply));
    void this.services.preload();
  }

  private readonly offs: Array<() => void> = [];

  /** An absolute path to a protocol path. */
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

  /** A notification goes only to the tabs looking at this project. */
  broadcast<E extends EventName>(event: E, payload: EventPayload<E>): void {
    for (const session of this.sessions) session.notify(event, payload);
  }

  /**
   * A reason to live without a single tab. A terminal and a language server take a hold
   * when they start and release it when they die; while one exists, the idle timeout
   * leaves the workspace alone.
   */
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

  /**
   * Lazily creates a subsystem and remembers it against the workspace. Calling
   * `ws.use('terminals', create)` from any method gives this project's terminals —
   * missing and getting somebody else's is impossible.
   */
  use<T extends WorkspaceResource>(key: string, create: (ws: Workspace) => T): T {
    if (this.disposed) throw new Error(`Workspace ${this.name} is already closed`);
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
    for (const off of this.offs.splice(0)) off();
    for (const [key, resource] of [...this.resources].reverse()) {
      try {
        await resource.dispose();
      } catch (err) {
        this.log.error(`resource ${key} did not close: ${String(err)}`);
      }
    }
    this.resources.clear();
    const orphans = this.processes.killOwned(this.root);
    if (orphans > 0) this.log.warn(`orphaned subprocesses killed: ${orphans}`);
    this.log.info('closed');
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
