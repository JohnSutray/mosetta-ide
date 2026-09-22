import type { AdapterProcess } from './adapter.js';
import { DapSession, type SessionOwner, type TerminalAsk } from './session.js';
import type { BreakpointAsk, ExceptionMode, RunInfo, Stop } from './types.js';

/** What a run needs from the project's host. */
export interface RunOwner {
  breakpoints(): ReadonlyMap<string, readonly BreakpointAsk[]>;
  exceptions(): ExceptionMode;
  toAdapter(key: string): string;
  /**
   * Carry it out in a real terminal on behalf of THIS run; `null` means there is no
   * terminal.
   */
  terminal(run: DebugRun, ask: TerminalAsk): Promise<{ shellProcessId?: number; processId?: number }>;
  hasTerminal(): boolean;
  changed(run: DebugRun): void;
  /**
   * Whether this run's program is still alive AFTER a polite stop. It is not the run
   * that knows this but the host: the program may live in the user's terminal, and
   * only the terminal can be asked about it.
   */
  stuck(run: DebugRun): Promise<boolean>;
  /** KILL: put out the run's whole process tree, with no asking. */
  kill(run: DebugRun): Promise<void>;
  stopped(run: DebugRun, session: DapSession, stop: Stop): void;
  output(run: DebugRun, session: DapSession, category: string, text: string): void;
  verified(run: DebugRun, key: string): void;
}

/** How long to wait for the adapter to put the program out itself, before killing it. */
const DISCONNECT_MS = 2000;

/**
 * One run under debugging is a TREE of sessions.
 *
 * The adapter sets up a root session for the run itself, and for every process it asks
 * the client to open a child one (`startDebugging`) — with a new connection carrying
 * `__pendingTargetId`. The breakpoints fire and the stops happen there, in the
 * children; the root never confirms them. `npm run dev` gives three levels: run → npm →
 * node. So from outside a "session" is always a pair (run, session) rather than one
 * number.
 */
export class DebugRun implements SessionOwner {
  state: RunInfo['state'] = 'starting';
  error: string | undefined;
  /** The address opened in the browser under the debugger. */
  url: string | undefined;
  private readonly sessions = new Map<string, DapSession>();
  private next = 0;

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly adapter: AdapterProcess,
    private readonly owner: RunOwner,
  ) {
    adapter.onExit((why) => {
      if (this.state === 'stopping') return;
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

  /**
   * A second ROOT on the same run: the browser to the server. The same adapter, a new
   * connection, no parent — this is not the server's child but its viewer. A run ends
   * when ALL the roots have ended.
   */
  async openRoot(configuration: Record<string, unknown>): Promise<void> {
    await this.open(null, 'launch', configuration);
  }

  session(id: string): DapSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`no debug session ${id} in run ${this.id}`);
    return session;
  }

  all(): DapSession[] {
    return [...this.sessions.values()];
  }

  /**
   * Stop: ask the adapter to put the program out, and if it did not manage in time,
   * kill the adapter itself. The adapter's children go away with it: it was the adapter
   * that started them.
   *
   * We put them out FROM THE LEAVES TO THE ROOT. The root does not answer a
   * `disconnect` while even one child is alive: from the root a stop ran into the
   * timeout and took two seconds, from the leaves it takes 26 ms.
   */
  async stop(options: { force?: boolean } = {}): Promise<void> {
    if (options.force) {
      await this.owner.kill(this);
      for (const session of this.sessions.values()) session.dispose();
      this.adapter.kill('SIGKILL');
      this.end(this.error);
      return;
    }
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
    if (await this.owner.stuck(this)) {
      this.state = 'stopping';
      this.owner.changed(this);
      return;
    }
    this.end(this.error);
  }

  /** The adapter's pid: its tree is put out by it. */
  get adapterPid(): number | undefined {
    return this.adapter.pid;
  }

  info(): RunInfo {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      sessions: [...this.sessions.values()].map((session) => session.info()),
      ...(this.url ? { url: this.url } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  breakpoints(): ReadonlyMap<string, readonly BreakpointAsk[]> {
    return this.owner.breakpoints();
  }

  exceptions(): ExceptionMode {
    return this.owner.exceptions();
  }

  toAdapter(key: string): string {
    return this.owner.toAdapter(key);
  }

  get runInTerminal(): SessionOwner['runInTerminal'] {
    return this.owner.hasTerminal() ? (ask) => this.owner.terminal(this, ask) : null;
  }

  child(parent: DapSession, request: 'launch' | 'attach', configuration: Record<string, unknown>): void {
    this.open(parent.id, request, configuration).catch((err) => {
      this.owner.output(this, parent, 'stderr', `child debug session failed: ${String(err)}\n`);
    });
  }

  /** How many stops in React's counterfeits were skipped — we say so once per run. */
  private skippedFakes = 0;

  skipped(session: DapSession): void {
    this.skippedFakes += 1;
    if (this.skippedFakes === 1) {
      this.owner.output(this, session, 'console', 'breakpoint hits inside React replayed stacks (about://React) are skipped\n');
    }
  }

  changed(session: DapSession): void {
    const roots = [...this.sessions.values()].filter((one) => one.parent === null);
    if (roots.length > 0 && roots.every((one) => one.state === 'ended')) {
      if (this.state !== 'stopping') this.end(this.error);
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

  private end(error: string | undefined): void {
    if (this.state === 'ended') return;
    this.state = 'ended';
    if (error) this.error = error;
    for (const session of this.sessions.values()) session.dispose();
    this.adapter.kill();
    this.owner.changed(this);
  }
}
