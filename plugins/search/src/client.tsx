import CodePlugin from '@mosetta/ide-plugin-code';
import { activate, command, configSection, plugin, registry, remote, stub } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { SearchIcon } from './icons.js';
import { SearchEverywhere } from './popup.js';
import { Search, type SearchRemote } from './state.js';
import { INDEX_DEFAULTS , INDEX_SCHEMA} from './settings.js';
import { STYLE } from './style.js';
import { OPENER_SCHEMA, RECENT_SCHEMA, type IndexKind, type Opener, type Recent, type SearchAnswer, type SearchStats } from './types.js';
import { layout } from './layout.js';
import { matcher } from './matcher.js';
import { textIndex } from './text.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import UiPlugin from '@mosetta/ide-plugin-ui';

export type { Found, IndexHit, IndexKind, Opener, Recent, SearchAnswer, SearchStats } from './types.js';
export { layout, Layout } from './layout.js';
export { matcher, Matcher, type Match } from './matcher.js';
export { textIndex, TextIndex, type Indexed } from './text.js';

@registry({ key: 'search.opener', schema: OPENER_SCHEMA })
@registry({ key: 'search.recent', schema: RECENT_SCHEMA })
@configSection({ section: 'index', defaults: INDEX_DEFAULTS, schema: INDEX_SCHEMA })
@plugin({ title: 'plugin.search' })
export default class SearchPlugin implements SearchRemote {
  readonly layout = layout;
  readonly matcher = matcher;
  readonly textIndex = textIndex;

  readonly search: Search;

  constructor(private readonly ide: Ide) {
    this.search = new Search(
      this,
      ide.registry<Opener>('search.opener'),
      () => ide.getPlugin(DocPlugin),
      ide.registry<Recent>('search.recent'),
      () => ide.settingsOf('index', INDEX_DEFAULTS).value.recentFiles,
    );
  }

  find(query: string, limit?: number, kinds?: IndexKind[]): Promise<SearchAnswer> {
    return this.askSearch({ query, limit, kinds });
  }

  @remote('search') protected askSearch(_params: {
    query: string;
    limit?: number;
    kinds?: IndexKind[];
  }): Promise<SearchAnswer> {
    return stub();
  }

  stats(): Promise<SearchStats> {
    return this.askStats();
  }

  @remote('stats') protected askStats(): Promise<SearchStats> {
    return stub();
  }

  @command('search.everywhere') protected toggle(): void { this.search.toggle(); }
  @command('search.next') protected next(): void { this.search.move(1); }
  @command('search.prev') protected prev(): void { this.search.move(-1); }
  @command('search.accept') protected accept(): void { this.search.accept(); }
  @command('search.close') protected close(): void { this.search.close(); }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry('toolbar.button').add({
      id: 'search',
      title: 'toolbar.search',
      command: 'search.everywhere',
      icon: (filled: boolean) => <SearchIcon filled={filled} />,
      active: this.search.open,
    });

    this.ide.registry<() => unknown>('chrome.top').add(() => <SearchEverywhere windows={this.ide.getPlugin(UiPlugin).windows} search={this.search} code={this.ide.getPlugin(CodePlugin)} />);
  }
}
