import type { KeyHost, KeyOs, KeyScope } from './types.js';

/**
 * What a key is called for a human. Geometric names are shown as a character:
 * `backquote` is `` ` ``, `slash` is `/`.
 */
const NAMES: Record<string, string> = {
  backquote: '`',
  slash: '/',
  bracketleft: '[',
  bracketright: ']',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: 'Enter',
  escape: 'Esc',
  backspace: 'Backspace',
  delete: 'Delete',
  space: 'Space',
  tab: 'Tab',
};

export class KeyHostInfo {
  readonly os: KeyOs;
  readonly host: KeyHost;

  /**
   * The name of the system and the environment arrive as PARAMETERS, and by default are
   * taken from the browser. The default is the only place that knows about `navigator`,
   * and it is what a test substitutes.
   */
  constructor(name: string = platformName(), host: KeyHost = detectHost()) {
    this.os = KeyHostInfo.osOf(name);
    this.host = host;
  }

  /**
   * The system by what it calls itself. The comparison is CASE-INSENSITIVE, and that is
   * not pedantry: `navigator.platform` answered `MacIntel`, while
   * `userAgentData.platform` answers `macOS` — with a small letter. The very first
   * version of this function compared against `Mac` and on a Mac went down the Linux
   * branch, that is, changed the whole layout. It is checked by a test: too expensive a
   * mistake to be left to the eye.
   *
   * It has stayed static on purpose: this is the parsing of a string, it has nothing to
   * learn from an instance, and it has to be called before an instance exists.
   */
  static osOf(name: string): KeyOs {
    if (/mac|iphone|ipad|darwin/i.test(name)) return 'mac';
    if (/win/i.test(name)) return 'win';
    return 'linux';
  }

  get isMac(): boolean {
    return this.os === 'mac';
  }

  /**
   * The scopes we belong to: the environment as a whole, and the same environment on
   * this system. A key is unavailable if at least one of them is named.
   */
  get scopes(): KeyScope[] {
    return [this.host, `${this.host}:${this.os}`];
  }

  /**
   * The same scopes, but from the particular to the general: that is the order they are
   * walked in when the most precise rule is being looked for.
   */
  get scopesExactFirst(): KeyScope[] {
    return [`${this.host}:${this.os}`, this.host];
  }

  /**
   * The MAIN modifier of this environment.
   *
   * It is not in the layout — there the keys are concrete — but the code needs it for
   * one rule: a chord with the main modifier belongs to the editor entirely, and the
   * browser gets nothing from it.
   *
   * The table is the same as in the layout's header: the main one is the least robbed
   * modifier of that environment. On a Mac it is Cmd in both environments: out of a
   * hundred-odd chords the browser keeps five for itself.
   */
  get primary(): 'meta' | 'control' | 'alt' {
    return this.isMac ? 'meta' : 'control';
  }

  /** Whether the MAIN modifier is pressed in this mouse or keyboard event. */
  primaryHeld(event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
    if (this.primary === 'meta') return event.metaKey;
    if (this.primary === 'alt') return event.altKey;
    return event.ctrlKey;
  }

  /**
   * `meta+shift+s` → `Cmd+Shift+S` for showing to a human. The names in the file are
   * physical and the same everywhere; to a human they are shown the way they are
   * printed on THEIR keyboard.
   */
  humanize(key: string): string {
    if (key.startsWith('double:')) {
      const name = this.humanize(key.slice('double:'.length));
      return `${name} ${name}`;
    }
    return key
      .split('+')
      .map((part) => {
        if (part === 'shift') return 'Shift';
        if (part === 'alt') return this.isMac ? 'Option' : 'Alt';
        if (part === 'control') return 'Control';
        if (part === 'meta') return this.isMac ? 'Cmd' : 'Win';
        if (NAMES[part]) return NAMES[part];
        return part.length === 1 ? part.toUpperCase() : part;
      })
      .join('+');
  }
}

/**
 * What the system calls itself.
 *
 * `navigator.platform` has been declared deprecated, and the replacement
 * (`userAgentData.platform`) is not in every browser — so we ask the new one first and
 * fall back to `userAgent`. For our task it is no worse: `Macintosh` contains `Mac`,
 * `Windows NT` contains `Win`, and we need no more than three answers anyway.
 */
function platformName(): string {
  if (typeof navigator === 'undefined') return '';
  const modern = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return modern ?? navigator.userAgent ?? '';
}

function detectHost(): KeyHost {
  return typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent)
    ? 'electron'
    : 'browser';
}

/** One per tab. The IDE's root object will become its owner. */
export const keyHost = new KeyHostInfo();
