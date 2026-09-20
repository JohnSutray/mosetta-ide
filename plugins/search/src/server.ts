import { activate, command, type CallContext, type Ide, type Project } from '@mosetta/ide-api/server';
import { FindProviders } from './finds.js';
import { SearchIndex } from './index.js';
import { INDEX_DEFAULTS } from './settings.js';
import type { FindProvider, IndexKind, SearchAnswer, SearchStats } from './types.js';

export type { FindProvider, Found, IndexHit, IndexKind, SearchAnswer, SearchStats } from './types.js';

/**
 * The "search everywhere" server half — the index.
 *
 * The derived layer stands on borrowed memory (`project.memory`) and comes up on
 * `onProject`: files and the suppliers' hits at once, symbols in the background as the
 * files arrive in memory (`doc.resident`). The suppliers are brought by neighbours: the
 * scripts put theirs in through `getPlugin(SearchServer).find(...)`, and the `npm` kind
 * is named nowhere in the core.
 */
export default class SearchServer {
  /** Who can find what. One registry per server: this is knowledge about the tool. */
  readonly finds = new FindProviders();

  constructor(private readonly ide: Ide) {}

  /** "I give hits of this kind". Called by neighbours as they come up. */
  find(provider: FindProvider): void {
    this.finds.add(provider);
  }

  @activate() protected start(): void {
    this.ide.onProject((project) => {
      const index = this.indexOf(project);
      if (!project.settings('index', INDEX_DEFAULTS).enabled) return;
      index.rebuild();
    });
  }

  /** THIS project's index: a project resource, dying with it. */
  indexOf(project: Project): SearchIndex {
    return project.use(
      'index',
      () =>
        new SearchIndex(project.memory, () => project.settings('index', INDEX_DEFAULTS), this.ide.log, this.finds),
    );
  }

  /** A synchronous search over memory — a double Shift does not wait. `limit` CUTS. */
  @command() protected search(params: unknown, call: CallContext): SearchAnswer {
    const asked = params as { query?: unknown; limit?: unknown; kinds?: unknown } | null;
    if (!asked || typeof asked.query !== 'string') throw new Error('query: string required');
    const limit = typeof asked.limit === 'number' ? asked.limit : undefined;
    const kinds = Array.isArray(asked.kinds) ? (asked.kinds as IndexKind[]) : undefined;
    return this.indexOf(call.project).search(asked.query, limit, kinds);
  }

  @command() protected stats(_params: unknown, call: CallContext): SearchStats {
    return this.indexOf(call.project).stats();
  }
}
