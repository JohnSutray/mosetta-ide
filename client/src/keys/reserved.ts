import type { KeyHost, KeyOs, KeyScope } from '@ide/protocol';

export interface ReservedKey {
  key: string;
  scopes: KeyScope[];
  who: string;
  what: string;
  soft?: boolean;
}

function digits(scopes: KeyScope[], who: string, what: string, lead: string): ReservedKey[] {
  return Array.from({ length: 9 }, (_, at) => ({
    key: `${lead}+${at + 1}`,
    scopes,
    who,
    what,
  }));
}

const MAC: KeyScope[] = ['browser:mac', 'electron:mac'];
const WIN: KeyScope[] = ['browser:win', 'electron:win'];
const CHROME_MAC: KeyScope[] = ['browser:mac'];
const CHROME_WIN: KeyScope[] = ['browser:win'];

export const RESERVED: ReservedKey[] = [
  { key: 'meta+tab', scopes: MAC, who: 'macOS', what: 'switch apps' },
  { key: 'meta+shift+tab', scopes: MAC, who: 'macOS', what: 'switch apps back' },
  { key: 'meta+q', scopes: MAC, who: 'macOS', what: 'quit the app' },
  { key: 'meta+h', scopes: MAC, who: 'macOS', what: 'hide the app' },
  { key: 'meta+m', scopes: MAC, who: 'macOS', what: 'minimise the window' },
  { key: 'meta+space', scopes: MAC, who: 'macOS', what: 'Spotlight' },
  { key: 'meta+backquote', scopes: MAC, who: 'macOS', what: 'next window of the app' },
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
  ...digits(CHROME_MAC, 'Chrome', 'switch to tab N', 'meta'),
  { key: 'meta+t', scopes: CHROME_MAC, who: 'Chrome', what: 'new tab' },
  { key: 'meta+w', scopes: CHROME_MAC, who: 'Chrome', what: 'close the tab' },
  { key: 'meta+n', scopes: CHROME_MAC, who: 'Chrome', what: 'new window' },
  { key: 'meta+shift+n', scopes: CHROME_MAC, who: 'Chrome', what: 'incognito window' },
  { key: 'meta+shift+t', scopes: CHROME_MAC, who: 'Chrome', what: 'reopen the closed tab' },
  { key: 'meta+l', scopes: CHROME_MAC, who: 'Chrome', what: 'focus the address bar' },
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
  { key: 'meta+shift+c', scopes: CHROME_MAC, who: 'Chrome', what: 'DevTools element picker' },

  ...digits(CHROME_WIN, 'Chrome', 'switch to tab N', 'control'),
  { key: 'control+t', scopes: CHROME_WIN, who: 'Chrome', what: 'new tab' },
  { key: 'control+w', scopes: CHROME_WIN, who: 'Chrome', what: 'close the tab' },
  { key: 'control+n', scopes: CHROME_WIN, who: 'Chrome', what: 'new window' },
  { key: 'control+shift+n', scopes: CHROME_WIN, who: 'Chrome', what: 'incognito window' },
  { key: 'control+shift+t', scopes: CHROME_WIN, who: 'Chrome', what: 'reopen the closed tab' },
  { key: 'control+l', scopes: CHROME_WIN, who: 'Chrome', what: 'focus the address bar' },
  { key: 'control+shift+i', scopes: CHROME_WIN, who: 'Chrome', what: 'DevTools' },
  { key: 'control+shift+c', scopes: CHROME_WIN, who: 'Chrome', what: 'DevTools element picker' },
  { key: 'control+r', scopes: CHROME_WIN, who: 'Chrome', what: 'reload — left to the browser on purpose' },
  { key: 'alt+tab', scopes: WIN, who: 'Windows', what: 'switch windows' },
  { key: 'alt+f4', scopes: WIN, who: 'Windows', what: 'close the window' },
];

export function reservedIn(scopes: KeyScope[]): ReservedKey[] {
  const here = new Set(scopes);
  return RESERVED.filter((item) => item.scopes.some((scope) => here.has(scope)));
}

export function hardIn(scopes: KeyScope[]): ReservedKey[] {
  return reservedIn(scopes).filter((item) => !item.soft);
}

export function physicalOf(key: string, modIsMeta: boolean, isMac: boolean): string {
  if (key.startsWith('double:')) {
    return `double:${physicalOf(key.slice('double:'.length), modIsMeta, isMac)}`;
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

export function modIsMetaIn(host: KeyHost, os: KeyOs): boolean {
  return os === 'mac' && host === 'electron';
}

export function keyIn(
  binding: { key: string; keys?: Partial<Record<KeyScope, string>> },
  host: KeyHost,
  os: KeyOs,
): string {
  const own = binding.keys?.[`${host}:${os}`] ?? binding.keys?.[host] ?? binding.key;
  return physicalOf(own, modIsMetaIn(host, os), os === 'mac');
}
