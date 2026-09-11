import { activate, command, type CallContext, type Ide, type Project, type ProjectResource } from '@mosetta/ide-api/server';
import { FsConflicts } from './conflicts.js';
import { MergeSessions } from './sessions.js';
import type { MergeSession, MergeSupply } from './types.js';

export type { MergeFile, MergeSession, MergeSide, MergeSource, MergeSupply } from './types.js';

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

export default class MergeServer {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.onProject((project) => void this.host(project));
  }

  private host(project: Project): MergeHost {
    return project.use('sessions', () => new MergeHost(project, this.ide));
  }

  open(project: Project, supply: MergeSupply): void {
    this.host(project).sessions.open(supply);
  }

  @command() protected state(_params: unknown, call: CallContext): MergeSession | null {
    return this.host(call.project).sessions.state();
  }

  @command() protected resolve(params: unknown, call: CallContext): Promise<MergeSession | null> {
    const asked = params as { path?: unknown; text?: unknown } | null;
    if (!asked || typeof asked.path !== 'string') throw new Error('нужен path');
    if (asked.text !== null && typeof asked.text !== 'string') throw new Error('нужен text: string | null');
    return this.host(call.project).sessions.resolve(asked.path, asked.text as string | null);
  }

  @command() protected async cancel(_params: unknown, call: CallContext): Promise<null> {
    await this.host(call.project).sessions.cancel();
    return null;
  }

  @command() protected fromDisk(params: unknown, call: CallContext): Promise<MergeSession | null> {
    const asked = params as { path?: unknown } | null;
    if (!asked || typeof asked.path !== 'string') throw new Error('нужен path');
    return this.host(call.project).conflicts.forReload(asked.path);
  }
}
