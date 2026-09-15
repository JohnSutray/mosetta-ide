import type { AdapterProcess } from './adapter.js';
import { DapSession, type SessionOwner } from './session.js';
import type { RunInfo, Stop } from './types.js';

export interface RunOwner {
  breakpoints(): ReadonlyMap<string, readonly number[]>;
  toAdapter(key: string): string;
  changed(run: DebugRun): void;
  stopped(run: DebugRun, session: DapSession, stop: Stop): void;
  output(run: DebugRun, session: DapSession, category: string, text: string): void;
  verified(run: DebugRun, key: string): void;
}

const DISCONNECT_MS = 2000;

export class DebugRun implements SessionOwner {
  state: RunInfo['state'] = 'starting';
  error: string | undefined;
  private readonly sessions = new Map<string, DapSession>();
  private next = 0;

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly adapter: AdapterProcess,
    private readonly owner: RunOwner,
  ) {
    adapter.onExit((why) => {
      if (this.state !== 'ended') this.end(this.error ?? (this.sessions.size === 0 ? why : undefined));
    });
  }

  async begin(configuration: Record<string, unknown>): Promise<void> {
    try {
      await this.open(null, 'launch', configuration);
      if (this.state === 'starting') {
        this.state = 'running';
        this.owner.changed(this);
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      await this.stop();
      throw err;
    }
  }

  session(id: string): DapSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`no debug session ${id} in run ${this.id}`);
    return session;
  }

  all(): DapSession[] {
    return [...this.sessions.values()];
  }

  async stop(): Promise<void> {
    const live = [...this.sessions.values()].filter((session) => session.state !== 'ended');
    const levels = new Map<number, DapSession[]>();
    for (const session of live) {
      const depth = this.depthOf(session);
      levels.set(depth, [...(levels.get(depth) ?? []), session]);
    }
    const deadline = new Promise((resolve) => setTimeout(resolve, DISCONNECT_MS));
    const ordered = [...levels.entries()].sort(([a], [b]) => b - a).map(([, sessions]) => sessions);
    const asked = (async () => {
      for (const sessions of ordered) {
        await Promise.all(
          sessions.map((session) =>
            session.request('disconnect', { terminateDebuggee: true }).catch(() => undefined),
          ),
        );
      }
    })();
    await Promise.race([asked, deadline]);
    for (const session of this.sessions.values()) session.dispose();
    this.adapter.kill();
    this.end(this.error);
  }

  info(): RunInfo {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      sessions: [...this.sessions.values()].map((session) => session.info()),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  breakpoints(): ReadonlyMap<string, readonly number[]> {
    return this.owner.breakpoints();
  }

  toAdapter(key: string): string {
    return this.owner.toAdapter(key);
  }

  child(parent: DapSession, request: 'launch' | 'attach', configuration: Record<string, unknown>): void {
    this.open(parent.id, request, configuration).catch((err) => {
      this.owner.output(this, parent, 'stderr', `child debug session failed: ${String(err)}\n`);
    });
  }

  changed(session: DapSession): void {
    const root = session.id === this.rootId();
    if (root && session.state === 'ended') {
      this.end(this.error);
      return;
    }
    this.owner.changed(this);
  }

  stopped(session: DapSession, stop: Stop): void {
    this.owner.stopped(this, session, stop);
  }

  output(session: DapSession, category: string, text: string): void {
    this.owner.output(this, session, category, text);
  }

  verified(_session: DapSession, key: string): void {
    this.owner.verified(this, key);
  }

  private async open(
    parent: string | null,
    request: 'launch' | 'attach',
    configuration: Record<string, unknown>,
  ): Promise<void> {
    const wire = await this.adapter.connect();
    const id = `${this.id}.${this.next++}`;
    const name = typeof configuration['name'] === 'string' ? configuration['name'] : this.name;
    const session = new DapSession(id, name, parent, wire, this);
    this.sessions.set(id, session);
    this.owner.changed(this);
    await session.begin(request, configuration);
  }

  private depthOf(session: DapSession): number {
    let depth = 0;
    for (let at = session.parent; at !== null; at = this.sessions.get(at)?.parent ?? null) depth += 1;
    return depth;
  }

  private rootId(): string {
    return `${this.id}.0`;
  }

  private end(error: string | undefined): void {
    if (this.state === 'ended') return;
    this.state = 'ended';
    if (error) this.error = error;
    for (const session of this.sessions.values()) session.dispose();
    this.adapter.kill();
    this.owner.changed(this);
  }
}
