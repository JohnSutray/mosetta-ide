import CodePlugin from '@mosetta/ide-plugin-code';
import { activate, plugin, remote, stub } from '@mosetta/ide-api/client';
import { signal } from '@preact/signals';
import type { Ide } from '@mosetta/ide-api/client';
import Editor from '@mosetta/ide-plugin-editor';
import LspPlugin from '@mosetta/ide-plugin-lsp';
import { SYMBOL_KINDS, SYMBOL_TAGS, SymbolIcon } from './icons.js';
import { SymbolsPopup } from './popup.js';
import { Symbols } from './state.js';
import { STYLE } from './style.js';
import SearchPlugin from '@mosetta/ide-plugin-search';
import UiPlugin from '@mosetta/ide-plugin-ui';
import type { SymbolHit } from './cache.js';

@plugin({ title: 'plugin.symbols' })
export default class SymbolsPlugin {
  readonly symbols: Symbols;

  constructor(private readonly ide: Ide) {
    this.symbols = new Symbols(ide, ide.getPlugin(LspPlugin));
  }

  private readonly uncovered = signal(0);

  private readonly tooBig = signal(0);

  @remote('find') protected askSymbols(_p: { query: string; limit: number; kinds?: string[] }): Promise<SymbolHit[]> { return stub(); }
  @remote('stats') protected askStats(): Promise<{ symbols: number; uncovered: number; tooBig: number }> { return stub(); }

  @activate() protected start(): void {
    this.ide.css(STYLE);

    this.ide.registry('search.source').add({
      id: 'ts-symbols',
      kind: 'ts',
      note: () => {
        if (this.uncovered.value > 0) {
          return { key: 'symbols.partial', params: { count: this.uncovered.value }, setting: 'fs.preloadBudgetMb' };
        }
        if (this.tooBig.value > 0) {
          return { key: 'symbols.tooBig', params: { count: this.tooBig.value }, setting: 'index.symbolsMaxKb' };
        }
        return null;
      },
      tags: () => SYMBOL_TAGS,
      find: async ({ term, tags, limit }: { term: string; tags: string[]; limit: number }) => {
        const kinds = tags.filter((tag) => SYMBOL_KINDS.includes(tag));
        if (term.trim() === '' && tags.length === 0) return [];
        void this.askStats()
          .then((stats) => {
            this.uncovered.value = stats.uncovered;
            this.tooBig.value = stats.tooBig;
          })
          .catch(() => undefined);
        const search = this.ide.getPlugin(SearchPlugin);
        const folded = search.textIndex.fold(term);
        const found = await this.askSymbols({
          query: term,
          limit: term === '' ? limit : Math.max(limit * 4, 200),
          ...(kinds.length > 0 ? { kinds } : {}),
        });
        if (term === '') {
          return found.map((hit) => ({
            kind: 'ts',
            label: hit.label,
            path: hit.path,
            line: hit.line,
            detail: hit.path,
            tags: [hit.kind],
            score: 0,
            matches: [],
          })) as never;
        }
        return found
          .map((hit) => {
            const scored = search.matcher.match(search.textIndex.of(hit.label), folded);
            return scored
              ? {
                  kind: 'ts',
                  label: hit.label,
                  path: hit.path,
                  line: hit.line,
                  detail: hit.path,
                  tags: [hit.kind],
                  score: scored.score,
                  matches: scored.positions,
                }
              : null;
          })
          .filter((hit): hit is NonNullable<typeof hit> => hit !== null)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      },
    });
    this.ide.registry('search.icon').add({
      kind: 'ts',
      icon: (hit: { tags?: string[] }) => (
        <SymbolIcon kind={(hit.tags ?? []).find((one) => SYMBOL_KINDS.includes(one)) ?? ''} />
      ),
    });

    this.ide.getPlugin(Editor).onSymbolAsk((spot) => void this.symbols.ask(spot));
    this.ide.registry<() => unknown>('chrome.top').add(() => <SymbolsPopup windows={this.ide.getPlugin(UiPlugin).windows} symbols={this.symbols} code={this.ide.getPlugin(CodePlugin)} />);
  }
}
