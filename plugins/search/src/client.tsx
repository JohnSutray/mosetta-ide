import CodePlugin from '@mosetta/ide-plugin-code';
import { activate, command, configSection, plugin, registry, remote, stub } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { SearchIcon } from './icons.js';
import { SearchEverywhere } from './popup.js';
import { Search, type SearchRemote } from './state.js';
import { INDEX_DEFAULTS , INDEX_SCHEMA} from './settings.js';
import { STYLE } from './style.js';
import { ICON_SCHEMA, OPENER_SCHEMA, SOURCE_SCHEMA, type FileViewLike, type IndexKind, type KindIcon, type Opener, type SearchAnswer, type SearchSource, type SearchStats } from './types.js';
import { layout } from './layout.js';
import { matcher } from './matcher.js';
import { textIndex } from './text.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import UiPlugin from '@mosetta/ide-plugin-ui';

export type { Found, IndexHit, IndexKind, KindIcon, Opener, SearchAnswer, SearchSource, SearchStats } from './types.js';
export { layout, Layout } from './layout.js';
export { matcher, Matcher, type Match } from './matcher.js';
export { textIndex, TextIndex, type Indexed } from './text.js';

/**
 * "Search everywhere" is a plugin. Requirement four of the brief: a rectangle OVER the
 * panels with a search field, results and a preview, on a double Shift.
 *
 * The index is our server half, standing on borrowed memory; here is what to show, in
 * what order, what to caption the sections with, and who to hand a hit to on Enter. The
 * owners of the kinds register in the `search.opener` key, which we declare: a script
 * gets run, a file gets opened. The preview is the same code view as everywhere else.
 */
@registry({ key: 'search.opener', schema: OPENER_SCHEMA })
@registry({ key: 'search.source', schema: SOURCE_SCHEMA })
@registry({ key: 'search.icon', schema: ICON_SCHEMA })
@configSection({ section: 'index', defaults: INDEX_DEFAULTS, schema: INDEX_SCHEMA })
@plugin({ title: 'plugin.search' })
export default class SearchPlugin implements SearchRemote {
  /** The matching mechanics are instance fields: neighbours take them from here. */
  readonly layout = layout;
  readonly matcher = matcher;
  readonly textIndex = textIndex;

  readonly search: Search;

  constructor(private readonly ide: Ide) {
    this.search = new Search(
      this,
      ide.registry<Opener>('search.opener'),
      () => ide.getPlugin(DocPlugin),
      () => ide.settingsOf('index', INDEX_DEFAULTS).value.recentFiles,
      ide.registry<FileViewLike>('file.view'),
      ide.registry<SearchSource>('search.source'),
      ide.remember<string[]>('search.kinds', [], 'both'),
      ide.remember<string[]>('search.kindsOff', [], 'both'),
      ide.remember<string[]>('search.folded', [], 'both'),
      ide.registry<KindIcon>('search.icon'),
    );
  }

  /** Ask the index. Named `find` rather than `search`: `search` is the window's state. */
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

  /** What the index managed to cover — the window asks on opening. */
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

    this.ide.registry<() => unknown>('chrome.top').add(() => <SearchEverywhere windows={this.ide.getPlugin(UiPlugin).windows} search={this.search} code={this.ide.getPlugin(CodePlugin)} views={this.ide.registry<FileViewLike>('file.view').all.value} />);
  }
}
