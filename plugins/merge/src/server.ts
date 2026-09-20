import { activate, command, type CallContext, type Ide, type Project, type ProjectResource } from '@mosetta/ide-api/server';
import { FsConflicts } from './conflicts.js';
import { MergeSessions } from './sessions.js';
import type { MergeSession, MergeSupply } from './types.js';

export type { MergeFile, MergeSession, MergeSide, MergeSource, MergeSupply } from './types.js';

/** One project's sessions plus the supplier of disk conflicts — a project resource. */
class MergeHost implements ProjectResource {
  readonly sessions = new MergeSessions();
  readonly conflicts: FsConflicts;
  private readonly off: () => void;

  constructor(project: Project, ide: Ide) {
    this.conflicts = new FsConflicts(project.memory, this.sessions, ide.log);
    this.off = this.sessions.on((state) => project.emit('state', state));
  }

  dispose(): void {
    this.off();
    this.conflicts.dispose();
    this.sessions.dispose();
  }
}

/**
 * The merging server half.
 *
 * A session is a resource of the PROJECT rather than of a tab: a conflict survives a
 * page reload, and two tabs of one project see one screen. It comes up on `onProject`:
 * the conflict supplier has to listen to `doc.saveBlocked` from the first second rather
 * than from the first call. Other suppliers (git, the shelf) will stand beside it
 * through `open(project, supply)`.
 */
export default class MergeServer {
  /**
   * Our own hosts by project root.
   *
   * Needed because `project.use` and `project.emit` are partitioned PER PLUGIN: a
   * neighbour passing their own `project` in here would set up a second host under
   * their own name, and the event about the session would leave as their event — the
   * merge screen would never learn of the argument at all. So the neighbour names the
   * ROOT, and we find our own project.
   */
  private readonly hosts = new Map<string, MergeHost>();

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.onProject((project) => void this.host(project));
  }

  private host(project: Project): MergeHost {
    const host = project.use('sessions', () => new MergeHost(project, this.ide));
    this.hosts.set(project.root, host);
    return host;
  }

  /**
   * Declare an argument on somebody else's behalf: the shelf and git arrive here. The
   * root rather than a `project`: see the hosts above.
   */
  open(root: string, supply: MergeSupply): void {
    const host = this.hosts.get(root);
    if (!host) throw new Error(`merge: the project ${root} is not open`);
    host.sessions.open(supply);
  }

  @command() protected state(_params: unknown, call: CallContext): MergeSession | null {
    return this.host(call.project).sessions.state();
  }

  @command() protected resolve(params: unknown, call: CallContext): Promise<MergeSession | null> {
    const asked = params as { path?: unknown; text?: unknown } | null;
    if (!asked || typeof asked.path !== 'string') throw new Error('path required');
    if (asked.text !== null && typeof asked.text !== 'string') throw new Error('text: string | null required');
    return this.host(call.project).sessions.resolve(asked.path, asked.text as string | null);
  }

  @command() protected async cancel(_params: unknown, call: CallContext): Promise<null> {
    await this.host(call.project).sessions.cancel();
    return null;
  }

  /** Pull disk into memory through an argument rather than silently. */
  @command() protected fromDisk(params: unknown, call: CallContext): Promise<MergeSession | null> {
    const asked = params as { path?: unknown } | null;
    if (!asked || typeof asked.path !== 'string') throw new Error('path required');
    return this.host(call.project).conflicts.forReload(asked.path);
  }
}
