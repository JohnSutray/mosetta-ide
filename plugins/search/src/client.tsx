import { activate, configSection, registry, remote, stub } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { SearchIcon } from './icons.js';
import { SearchEverywhere } from './popup.js';
import { Search, type SearchRemote } from './state.js';
import { INDEX_DEFAULTS } from './settings.js';
import { STYLE } from './style.js';
import { OPENER_SCHEMA, type IndexHit, type IndexKind, type Opener } from './types.js';

export type { Found, IndexHit, IndexKind, Opener, SearchStats } from './types.js';
export { layout, Layout } from './layout.js';
export { matcher, Matcher, type Match } from './matcher.js';
export { textIndex, TextIndex, type Indexed } from './text.js';

@registry({ key: 'search.opener', schema: OPENER_SCHEMA })
@configSection({ section: 'index', defaults: INDEX_DEFAULTS })
export default class SearchPlugin implements SearchRemote {
  readonly search: Search;

  constructor(private readonly ide: Ide) {
    this.search = new Search(this, ide.registry<Opener>('search.opener'));
  }

  find(query: string, limit?: number, kinds?: IndexKind[]): Promise<IndexHit[]> {
    return this.askSearch({ query, limit, kinds });
  }

  @remote('search') protected askSearch(_params: {
    query: string;
    limit?: number;
    kinds?: IndexKind[];
  }): Promise<IndexHit[]> {
    return stub();
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    const { search } = this;

    this.ide.command('search.everywhere', () => search.toggle());
    this.ide.command('search.next', () => search.move(1));
    this.ide.command('search.prev', () => search.move(-1));
    this.ide.command('search.accept', () => search.accept());
    this.ide.command('search.close', () => search.close());

    this.ide.registry('toolbar.button').add({
      id: 'search',
      title: 'toolbar.search',
      command: 'search.everywhere',
      icon: (filled: boolean) => <SearchIcon filled={filled} />,
      active: search.open,
    });

    this.ide.registry<() => unknown>('chrome.top').add(() => <SearchEverywhere search={search} />);
  }
}
