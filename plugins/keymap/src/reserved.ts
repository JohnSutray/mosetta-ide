import type { KeyHost, KeyOs, KeyScope } from './types.js';

/**
 * The keys we DO NOT have.
 *
 * They were taken by the system and the browser, and taken before us: the event either
 * does not reach the page at all, or reaches it already together with somebody else's
 * action. This knowledge used to live in a head and surface one item at a time — every
 * time as "for some reason it does not work", every time with half an hour of
 * investigation.
 *
 * Now it is a table, and it has three jobs:
 *
 * - **show the human**, as a plate of its own in the "Keys" window: here is what is
 * taken here, and by whom;
 *
 * - **stop me**, by a test: a binding on a taken key does not pass until it says
 * explicitly that it does not work there;
 *
 * - **not to forget**: the list grows as things are found rather than from memory.
 *
 * A key is written down PHYSICALLY (`meta`, `control`, `alt`) rather than through
 * `mod`: they are taken away from concrete keys rather than from our roles.
 */

export interface ReservedKey {
  /** The physical spelling: `meta+alt+arrowleft`. */
  key: string;
  /**
   * Where it is taken. A list rather than one scope: the system takes a key from ANY
   * application, so its rows name both the browser and the shell to come, whereas
   * Chrome names only the browser.
   */
  scopes: KeyScope[];
  /** Who took it: `macOS`, `Chrome`. */
  who: string;
  /** What it does instead of us. */
  what: string;
  /**
   * **We took this one.** The browser does such a thing by default, but it listens to
   * `preventDefault`.
   *
   * The difference is a live one. Cmd+T the browser handles at home, the event does not
   * reach the page at all, and no interception will help. Whereas Cmd+← ("back through
   * the tab's history") and Cmd+S ("save page as") are ordinary page events: swallow
   * them and the key is ours. The human checked both in the console; until then it all
   * lay in one heap of "impossible", and we were leaving half the keyboard unused for
   * nothing.
   *
   * Such rows stay in the table (a human needs to know whose behaviour we have
   * swallowed), bindings on them are allowed, and they are swallowed EVERYWHERE.
   *
   * A row WITHOUT this field means the opposite: we do not have the key. Either the
   * browser does not give it up, or we left it to the browser ourselves — like Cmd+R:
   * while there is no shell, reloading the tab is the only way to bring the IDE back up
   * after a bad edit, and the way out is not taken away.
   */
  soft?: boolean;
}

/** Expand `meta+1…9` into nine rows with a single entry. */
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

/**
 * Taken by the system — which means from everyone, in the browser and in the shell
 * alike.
 */
const MAC: KeyScope[] = ['browser:mac', 'electron:mac'];
const WIN: KeyScope[] = ['browser:win', 'electron:win'];
/** Taken by the browser — which means only in the browser. */
const CHROME_MAC: KeyScope[] = ['browser:mac'];
const CHROME_WIN: KeyScope[] = ['browser:win'];

const TABLE: ReservedKey[] = [
  { key: 'meta+tab', scopes: MAC, who: 'macOS', what: 'switch apps' },
  { key: 'meta+shift+tab', scopes: MAC, who: 'macOS', what: 'switch apps back' },
  { key: 'meta+q', scopes: MAC, who: 'macOS', what: 'quit the app' },
  { key: 'meta+h', scopes: MAC, who: 'macOS', what: 'hide the app' },
  { key: 'meta+m', scopes: MAC, who: 'macOS', what: 'minimise the window' },
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
  {
    key: 'alt+space',
    scopes: MAC,
    who: 'macOS',
    what: 'previous input source (Karabiner turns Option+Shift into it; checked 10.09)',
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
  { key: 'meta+alt+arrowleft', scopes: CHROME_MAC, who: 'Chrome', what: 'previous tab (checked 07.09)' },
  { key: 'meta+alt+arrowright', scopes: CHROME_MAC, who: 'Chrome', what: 'next tab (checked 07.09)' },
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
  { key: 'meta+shift+d', scopes: CHROME_MAC, who: 'Chrome', what: 'bookmark all tabs', soft: true },
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
  { key: 'meta+r', scopes: CHROME_MAC, who: 'Chrome', what: 'reload', soft: true },
  { key: 'meta+shift+r', scopes: CHROME_MAC, who: 'Chrome', what: 'hard reload', soft: true },
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
  /** The whole table: the "Keys" window shows it, and a test checks against it. */
  readonly table = TABLE;

  /** What is taken in these scopes. The order is the table's. */
  in(scopes: KeyScope[]): ReservedKey[] {
    const here = new Set(scopes);
    return this.table.filter((item) => item.scopes.some((scope) => here.has(scope)));
  }

  /** Taken for good: it cannot be occupied, and interception will not help. */
  hardIn(scopes: KeyScope[]): ReservedKey[] {
    return this.in(scopes).filter((item) => !item.soft);
  }

  /**
   * Our spelling of a key → the physical one.
   *
   * `mod` and `clip` are ROLES, and in different environments different keys play them.
   * Only physics can be compared against the table of what is taken.
   */
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

  /** The leading modifier is Cmd only in the shell on a Mac. */
  modIsMetaIn(host: KeyHost, os: KeyOs): boolean {
    return os === 'mac' && host === 'electron';
  }

  /**
   * A binding's key in the PHYSICAL spelling for the given environment. One function
   * both for showing and for checking against what is taken: two would have diverged on
   * the very first day.
   */
  keyIn(
    binding: { key: string; keys?: Partial<Record<KeyScope, string>> },
    host: KeyHost,
    os: KeyOs,
  ): string {
    const own = binding.keys?.[`${host}:${os}`] ?? binding.keys?.[host] ?? binding.key;
    return this.physicalOf(own, this.modIsMetaIn(host, os), os === 'mac');
  }
}

/** One per tab. The IDE's root object will become its owner. */
export const reserved = new Reserved();
