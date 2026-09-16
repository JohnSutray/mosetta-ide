import CodePlugin from '@mosetta/ide-plugin-code';
import { activate, plugin, remote, stub } from '@mosetta/ide-api/client';
import { signal } from '@preact/signals';
import type { Ide } from '@mosetta/ide-api/client';
import Editor from '@mosetta/ide-plugin-editor';
import LspPlugin from '@mosetta/ide-plugin-lsp';
import { SymbolIcon } from './icons.js';
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

  @remote('find') protected askSymbols(_p: { query: string; limit: number }): Promise<SymbolHit[]> { return stub(); }
  @remote('stats') protected askStats(): Promise<{ symbols: number; uncovered: number }> { return stub(); }

  @activate() protected start(): void {
    this.ide.css(STYLE);

    this.ide.registry('search.source').add({
      id: 'ts-symbols',
      kind: 'ts',
      note: () => (this.uncovered.value > 0 ? { key: 'symbols.partial', params: { count: this.uncovered.value } } : null),
      find: async (query: string, limit: number) => {
        void this.askStats().then((stats) => (this.uncovered.value = stats.uncovered)).catch(() => undefined);
        const search = this.ide.getPlugin(SearchPlugin);
        const found = await this.askSymbols({ query, limit: Math.max(limit * 4, 200) });
        return found
          .map((hit) => {
            const label = `ts::${hit.label}`;
            const scored = search.matcher.match(search.textIndex.of(label), query);
            return scored
              ? {
                  kind: 'ts',
                  label,
                  path: hit.path,
                  line: hit.line,
                  detail: hit.path,
                  detailKey: `search.symbol.${hit.kind}`,
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
      icon: (hit: { detailKey?: string }) => (
        <SymbolIcon kind={(hit.detailKey ?? '').replace('search.symbol.', '')} />
      ),
    });

    this.ide.getPlugin(Editor).onSymbolAsk((spot) => void this.symbols.ask(spot));
    this.ide.registry<() => unknown>('chrome.top').add(() => <SymbolsPopup windows={this.ide.getPlugin(UiPlugin).windows} symbols={this.symbols} code={this.ide.getPlugin(CodePlugin)} />);
  }
}
