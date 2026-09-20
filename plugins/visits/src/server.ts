import { command, type CallContext, type Ide } from '@mosetta/ide-api/server';
import { VisitsStore } from './store.js';
import type { Visit } from './types.js';

/**
 * The caret history's server half.
 *
 * The history is the state of a PROJECT on this machine: two tabs share one, and it
 * survives a restart. It lives in the plugin's state directory, one file per project.
 */
export default class VisitsServer {
  private readonly store = new VisitsStore();

  constructor(private readonly ide: Ide) {}

  @command() protected get(_params: unknown, call: CallContext): Promise<Visit[]> {
    return this.store.load(this.ide.state, call.project.root);
  }

  @command() protected async set(params: unknown, call: CallContext): Promise<{ saved: number }> {
    const asked = params as { visits?: unknown } | null;
    if (!asked || !Array.isArray(asked.visits)) throw new Error('visits: Visit[] required');
    const visits = (asked.visits as Visit[]).slice(-this.store.limit);
    await this.store.save(this.ide.state, call.project.root, visits);
    return { saved: visits.length };
  }
}
