import { activate, command, type CallContext, type Ide, type Project } from '@mosetta/ide-api/server';
import { FindProviders } from './finds.js';
import { SearchIndex } from './index.js';
import { INDEX_DEFAULTS } from './settings.js';
import type { FindProvider, IndexKind, SearchAnswer, SearchStats } from './types.js';

export type { FindProvider, Found, IndexHit, IndexKind, SearchAnswer, SearchStats } from './types.js';

export default class SearchServer {
  readonly finds = new FindProviders();

  constructor(private readonly ide: Ide) {}

  find(provider: FindProvider): void {
    this.finds.add(provider);
  }

  @activate() protected start(): void {
    this.ide.onProject((project) => {
      const index = this.indexOf(project);
      if (!project.settings('index', INDEX_DEFAULTS).enabled) return;
      index.rebuild();
      void index.indexSymbols();
    });
  }

  indexOf(project: Project): SearchIndex {
    return project.use(
      'index',
      () =>
        new SearchIndex(
          project.memory,
          () => project.settings('index', INDEX_DEFAULTS),
          this.ide.log,
          this.finds,
          (path) => {
            const skipped = new Set(project.settings('fs', { noScan: [] as string[] }).noScan);
            return path.split('/').some((part) => skipped.has(part));
          },
        ),
    );
  }

  @command() protected search(params: unknown, call: CallContext): SearchAnswer {
    const asked = params as { query?: unknown; limit?: unknown; kinds?: unknown } | null;
    if (!asked || typeof asked.query !== 'string') throw new Error('нужен query: string');
    const limit = typeof asked.limit === 'number' ? asked.limit : undefined;
    const kinds = Array.isArray(asked.kinds) ? (asked.kinds as IndexKind[]) : undefined;
    return this.indexOf(call.project).search(asked.query, limit, kinds);
  }

  @command() protected stats(_params: unknown, call: CallContext): SearchStats {
    return this.indexOf(call.project).stats();
  }
}
