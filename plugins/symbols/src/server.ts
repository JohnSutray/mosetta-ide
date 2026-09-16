import { activate, command, type CallContext, type Ide, type Project } from '@mosetta/ide-api/server';
import { SymbolCache, type SymbolHit } from './cache.js';

export default class SymbolsServer {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.onProject((project) => void this.cacheOf(project).warmUp());
  }

  cacheOf(project: Project): SymbolCache {
    return project.use(
      'cache',
      () =>
        new SymbolCache(
          project,
          project.memory,
          this.ide.log,
          this.ide.dir,
          () => project.settings('index', { symbolsMaxKb: 512 }).symbolsMaxKb * 1024,
          (path) => {
            const skipped = new Set(project.settings('fs', { noScan: [] as string[] }).noScan);
            return path.split('/').some((part) => skipped.has(part));
          },
        ),
    );
  }

  @command() protected find(params: unknown, call: CallContext): SymbolHit[] {
    const ask = params as { query?: unknown; limit?: unknown; kinds?: unknown } | null;
    if (typeof ask?.query !== 'string') throw new Error('query: string is required');
    const limit = typeof ask.limit === 'number' ? ask.limit : 200;
    const kinds = Array.isArray(ask.kinds) ? (ask.kinds as string[]) : undefined;
    return this.cacheOf(call.project).find(ask.query, limit, kinds);
  }

  @command() protected stats(_params: unknown, call: CallContext): { symbols: number; uncovered: number } {
    const cache = this.cacheOf(call.project);
    return { symbols: cache.size, uncovered: cache.uncovered };
  }
}
