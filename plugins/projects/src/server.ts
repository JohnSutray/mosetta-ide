import { command, type CallContext, type Ide } from '@ide/api/server';
import { Browse } from './browse.js';
import { Recent } from './recent.js';
import type { DirSuggestion, RecentProject } from './types.js';

export default class ProjectsServer {
  private readonly browse = new Browse();
  private readonly recent: Recent;

  constructor(ide: Ide) {
    this.recent = new Recent(ide.state);
  }

  @command() protected roots(): Promise<DirSuggestion[]> {
    return this.browse.roots();
  }

  @command('recent') protected listRecent(): Promise<RecentProject[]> {
    return this.recent.list();
  }

  @command('browse') protected browseDirs(params: unknown): Promise<DirSuggestion[]> {
    const asked = params as { prefix?: unknown; depth?: unknown; limit?: unknown } | null;
    if (!asked || typeof asked.prefix !== 'string') throw new Error('нужен prefix: string');
    const depth = Math.min(2, Math.max(1, typeof asked.depth === 'number' ? asked.depth : 1));
    const limit = typeof asked.limit === 'number' && asked.limit > 0 ? asked.limit : Number.POSITIVE_INFINITY;
    return this.browse.suggestDirectories(asked.prefix, limit, depth);
  }

  @command() protected async remember(_params: unknown, call: CallContext): Promise<null> {
    await this.recent.remember(call.project.root, call.project.name);
    return null;
  }
}
