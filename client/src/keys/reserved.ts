import type { KeyHost, KeyOs, KeyScope } from '@ide/protocol';

export interface ReservedKey {
  key: string;
  scopes: KeyScope[];
  who: string;
  what: string;
  soft?: boolean;
}

function digits(
  scopes: KeyScope[],
  who: string,
  what: string,
  lead: string,
  soft = false,
): ReservedKey[] {
  return Array.from({ length: 9 }, (_, at) => ({
    key: `${lead}+${at + 1}`,
    scopes,
    who,
    what,
    ...(soft ? { soft: true } : {}),
  }));
}

const MAC: KeyScope[] = ['browser:mac', 'electron:mac'];
const WIN: KeyScope[] = ['browser:win', 'electron:win'];
const CHROME_MAC: KeyScope[] = ['browser:mac'];
const CHROME_WIN: KeyScope[] = ['browser:win'];

const TABLE: ReservedKey[] = [
  { key: 'meta+tab', scopes: MAC, who: 'macOS', what: 'switch apps' },
  { key: 'meta+shift+tab', scopes: MAC, who: 'macOS', what: 'switch apps back' },
  { key: 'meta+q', scopes: MAC, who: 'macOS', what: 'quit the app' },
  { key: 'meta+h', scopes: MAC, who: 'macOS', what: 'hide the app' },
  { key: 'meta+m', scopes: MAC, who: 'macOS', what: 'minimise the window' },
  { key: 'meta+space', scopes: MAC, who: 'macOS', what: 'Spotlight' },
  {
    key: 'meta+backquote',
    scopes: CHROME_MAC,
    who: 'Chrome',
    what: 'next window of the app',
  },
  {
    key: 'control+arrowleft',
    scopes: MAC,
    who: 'macOS',
    what: 'previous desktop (Spaces)',
  },
  { key: 'control+arrowright', scopes: MAC, who: 'macOS', what: 'next desktop (Spaces)' },
  { key: 'control+arrowup', scopes: MAC, who: 'macOS', what: 'Mission Control / tiling' },
  { key: 'control+arrowdown', scopes: MAC, who: 'macOS', what: 'app windows / tiling' },
  {
    key: 'alt+tab',
    scopes: MAC,
    who: 'macOS',
    what: 'keyboard focus mode — walks the browser chrome',
  },
  {
    key: 'control+space',
    scopes: MAC,
    who: 'macOS',
    what: 'switch input source (if more than one)',
  },
  { key: 'control+f2', scopes: MAC, who: 'macOS', what: 'focus the menu bar' },

  {
    key: 'meta+arrowleft',
    scopes: CHROME_MAC,
    who: 'Chrome',
    what: 'back in tab history',
    soft: true,
  },
  {
    key: 'meta+arrowright',
    scopes: CHROME_MAC,
    who: 'Chrome',
    what: 'forward in tab history',
    soft: true,
  },
  { key: 'meta+alt+arrowleft', scopes: CHROME_MAC, who: 'Chrome', what: 'previous tab' },
  { key: 'meta+alt+arrowright', scopes: CHROME_MAC, who: 'Chrome', what: 'next tab' },
  ...digits(CHROME_MAC, 'Chrome', 'switch to tab N', 'meta', true),
  { key: 'meta+t', scopes: CHROME_MAC, who: 'Chrome', what: 'new tab' },
  { key: 'meta+w', scopes: CHROME_MAC, who: 'Chrome', what: 'close the tab' },
  { key: 'meta+n', scopes: CHROME_MAC, who: 'Chrome', what: 'new window' },
  { key: 'meta+e', scopes: CHROME_MAC, who: 'macOS', what: 'use selection for find' },
  { key: 'meta+shift+n', scopes: CHROME_MAC, who: 'Chrome', what: 'incognito window' },
  { key: 'meta+shift+t', scopes: CHROME_MAC, who: 'Chrome', what: 'reopen the closed tab' },
  {
    key: 'meta+l',
    scopes: CHROME_MAC,
    who: 'Chrome',
    what: 'focus the address bar',
    soft: true,
  },
  { key: 'meta+d', scopes: CHROME_MAC, who: 'Chrome', what: 'bookmark the page', soft: true },
  { key: 'meta+o', scopes: CHROME_MAC, who: 'Chrome', what: 'open a file', soft: true },
  { key: 'meta+y', scopes: CHROME_MAC, who: 'Chrome', what: 'history', soft: true },
  { key: 'meta+minus', scopes: CHROME_MAC, who: 'Chrome', what: 'zoom out', soft: true },
  { key: 'meta+equal', scopes: CHROME_MAC, who: 'Chrome', what: 'zoom in', soft: true },
  { key: 'meta+0', scopes: CHROME_MAC, who: 'Chrome', what: 'reset zoom', soft: true },
  {
    key: 'meta+s',
    scopes: CHROME_MAC,
    who: 'Chrome',
    what: 'save the page',
    soft: true,
  },
  {
    key: 'meta+p',
    scopes: CHROME_MAC,
    who: 'Chrome',
    what: 'print the page',
    soft: true,
  },
  {
    key: 'meta+f',
    scopes: CHROME_MAC,
    who: 'Chrome',
    what: 'find on the page',
    soft: true,
  },
  { key: 'meta+r', scopes: CHROME_MAC, who: 'Chrome', what: 'reload — left to the browser on purpose' },
  {
    key: 'meta+shift+r',
    scopes: CHROME_MAC,
    who: 'Chrome',
    what: 'hard reload — left to the browser on purpose',
  },
  { key: 'meta+alt+i', scopes: CHROME_MAC, who: 'Chrome', what: 'DevTools' },
  { key: 'meta+alt+j', scopes: CHROME_MAC, who: 'Chrome', what: 'DevTools console' },
  {
    key: 'meta+shift+c',
    scopes: CHROME_MAC,
    who: 'Chrome',
    what: 'DevTools element picker',
    soft: true,
  },

  { key: 'alt+tab', scopes: WIN, who: 'Windows', what: 'switch windows' },
  { key: 'alt+f4', scopes: WIN, who: 'Windows', what: 'close the window' },
  { key: 'meta', scopes: WIN, who: 'Windows', what: 'Start menu — a bare tap takes focus away' },
  { key: 'alt', scopes: CHROME_WIN, who: 'Chrome', what: 'menu bar — a bare tap takes focus away' },

  ...digits(CHROME_WIN, 'Chrome', 'switch to tab N', 'control'),
  { key: 'control+t', scopes: CHROME_WIN, who: 'Chrome', what: 'new tab' },
  { key: 'control+w', scopes: CHROME_WIN, who: 'Chrome', what: 'close the tab' },
  { key: 'control+shift+w', scopes: CHROME_WIN, who: 'Chrome', what: 'close the window' },
  { key: 'control+n', scopes: CHROME_WIN, who: 'Chrome', what: 'new window' },
  { key: 'control+shift+n', scopes: CHROME_WIN, who: 'Chrome', what: 'incognito window' },
  { key: 'control+shift+t', scopes: CHROME_WIN, who: 'Chrome', what: 'reopen the closed tab' },
  { key: 'control+tab', scopes: CHROME_WIN, who: 'Chrome', what: 'next tab' },
  { key: 'control+shift+tab', scopes: CHROME_WIN, who: 'Chrome', what: 'previous tab' },
  { key: 'control+pageup', scopes: CHROME_WIN, who: 'Chrome', what: 'previous tab' },
  { key: 'control+pagedown', scopes: CHROME_WIN, who: 'Chrome', what: 'next tab' },
  { key: 'control+l', scopes: CHROME_WIN, who: 'Chrome', what: 'focus the address bar' },
  { key: 'alt+d', scopes: CHROME_WIN, who: 'Chrome', what: 'focus the address bar' },
  { key: 'control+shift+i', scopes: CHROME_WIN, who: 'Chrome', what: 'DevTools' },
  { key: 'control+shift+j', scopes: CHROME_WIN, who: 'Chrome', what: 'DevTools console' },
  { key: 'f11', scopes: CHROME_WIN, who: 'Chrome', what: 'fullscreen' },
  { key: 'f12', scopes: CHROME_WIN, who: 'Chrome', what: 'DevTools' },
  { key: 'control+r', scopes: CHROME_WIN, who: 'Chrome', what: 'reload — left to the browser on purpose' },
  { key: 'control+shift+r', scopes: CHROME_WIN, who: 'Chrome', what: 'hard reload — left to the browser on purpose' },

  { key: 'control+s', scopes: CHROME_WIN, who: 'Chrome', what: 'save the page', soft: true },
  { key: 'control+p', scopes: CHROME_WIN, who: 'Chrome', what: 'print the page', soft: true },
  { key: 'control+f', scopes: CHROME_WIN, who: 'Chrome', what: 'find on the page', soft: true },
  { key: 'control+g', scopes: CHROME_WIN, who: 'Chrome', what: 'find next', soft: true },
  { key: 'control+shift+g', scopes: CHROME_WIN, who: 'Chrome', what: 'find previous', soft: true },
  { key: 'control+d', scopes: CHROME_WIN, who: 'Chrome', what: 'bookmark the page', soft: true },
  { key: 'control+shift+d', scopes: CHROME_WIN, who: 'Chrome', what: 'bookmark all tabs', soft: true },
  { key: 'control+h', scopes: CHROME_WIN, who: 'Chrome', what: 'history', soft: true },
  { key: 'control+j', scopes: CHROME_WIN, who: 'Chrome', what: 'downloads', soft: true },
  { key: 'control+o', scopes: CHROME_WIN, who: 'Chrome', what: 'open a file', soft: true },
  { key: 'control+u', scopes: CHROME_WIN, who: 'Chrome', what: 'view source', soft: true },
  { key: 'control+shift+o', scopes: CHROME_WIN, who: 'Chrome', what: 'bookmark manager', soft: true },
  { key: 'control+shift+b', scopes: CHROME_WIN, who: 'Chrome', what: 'bookmarks bar', soft: true },
  { key: 'control+shift+c', scopes: CHROME_WIN, who: 'Chrome', what: 'DevTools element picker', soft: true },
  { key: 'control+shift+delete', scopes: CHROME_WIN, who: 'Chrome', what: 'clear browsing data', soft: true },
  { key: 'alt+arrowleft', scopes: CHROME_WIN, who: 'Chrome', what: 'back in tab history', soft: true },
  { key: 'alt+arrowright', scopes: CHROME_WIN, who: 'Chrome', what: 'forward in tab history', soft: true },
  { key: 'alt+home', scopes: CHROME_WIN, who: 'Chrome', what: 'home page', soft: true },
];

export class Reserved {
  readonly table = TABLE;

  in(scopes: KeyScope[]): ReservedKey[] {
    const here = new Set(scopes);
    return this.table.filter((item) => item.scopes.some((scope) => here.has(scope)));
  }

  hardIn(scopes: KeyScope[]): ReservedKey[] {
    return this.in(scopes).filter((item) => !item.soft);
  }

  physicalOf(key: string, modIsMeta: boolean, isMac: boolean): string {
    if (key.startsWith('double:')) {
      return `double:${this.physicalOf(key.slice('double:'.length), modIsMeta, isMac)}`;
    }
    const lead = modIsMeta ? 'meta' : 'control';
    const clip = isMac ? 'meta' : 'control';
    const parts = key.split('+').map((part) => {
      if (part === 'mod') return lead;
      if (part === 'clip') return clip;
      if (part === 'cmd') return 'meta';
      if (part === 'ctrl') return 'control';
      return part;
    });
    const main = parts.pop() ?? '';
    const mods = new Set(parts);
    const out: string[] = [];
    if (mods.has('meta')) out.push('meta');
    if (mods.has('control')) out.push('control');
    if (mods.has('alt')) out.push('alt');
    if (mods.has('shift')) out.push('shift');
    out.push(main);
    return out.join('+');
  }

  modIsMetaIn(host: KeyHost, os: KeyOs): boolean {
    return os === 'mac' && host === 'electron';
  }

  keyIn(
    binding: { key: string; keys?: Partial<Record<KeyScope, string>> },
    host: KeyHost,
    os: KeyOs,
  ): string {
    const own = binding.keys?.[`${host}:${os}`] ?? binding.keys?.[host] ?? binding.key;
    return this.physicalOf(own, this.modIsMetaIn(host, os), os === 'mac');
  }
}

export const reserved = new Reserved();
