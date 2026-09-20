import { command, type CallContext, type Ide } from '@mosetta/ide-api/server';
import { Browse } from './browse.js';
import { Recent } from './recent.js';
import type { DirSuggestion, RecentProject } from './types.js';

/**
 * The picker's server half.
 *
 * Two pieces of knowledge about the MACHINE that the core used to carry in its `env/`
 * axis: which directories exist on it, and which projects have been opened on it. They
 * are read by the picker alone — so they are its knowledge. Opening a project is still
 * something only the core can do; we remember that it was opened, with a method of our
 * own and into a state directory of our own.
 */
export default class ProjectsServer {
  private readonly browse = new Browse();
  private readonly recent: Recent;

  constructor(ide: Ide) {
    this.recent = new Recent(ide.state);
  }

  /** The roots of the choice tree: the home directory and the drive root. */
  @command() protected roots(): Promise<DirSuggestion[]> {
    return this.browse.roots();
  }

  /** The recently opened — the machine's history rather than the tab's. */
  @command('recent') protected listRecent(): Promise<RecentProject[]> {
    return this.recent.list();
  }

  /**
   * Directories by the start of a path. A project is neither needed nor taken here:
   * there may be none at that moment. `limit` CUTS, and has to be asked for explicitly;
   * the depth is limited to two, since a third level is hundreds of readdir calls per
   * request, and people reach it by clicking.
   */
  @command('browse') protected browseDirs(params: unknown): Promise<DirSuggestion[]> {
    const asked = params as { prefix?: unknown; depth?: unknown; limit?: unknown } | null;
    if (!asked || typeof asked.prefix !== 'string') throw new Error('prefix: string required');
    const depth = Math.min(2, Math.max(1, typeof asked.depth === 'number' ? asked.depth : 1));
    const limit = typeof asked.limit === 'number' && asked.limit > 0 ? asked.limit : Number.POSITIVE_INFINITY;
    return this.browse.suggestDirectories(asked.prefix, limit, depth);
  }

  /**
   * A project was opened — remember it. Called after the open, when the session is
   * already attached.
   */
  @command() protected async remember(_params: unknown, call: CallContext): Promise<null> {
    await this.recent.remember(call.project.root, call.project.name);
    return null;
  }
}
