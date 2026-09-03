import { activate } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { SearchIcon } from './icons.js';
import { SearchEverywhere } from './popup.js';
import { Search } from './state.js';
import { STYLE } from './style.js';

export default class SearchPlugin {
  readonly search = new Search();

  constructor(private readonly ide: Ide) {}

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
