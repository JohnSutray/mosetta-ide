import type { KeyHost, KeyOs, KeyScope } from './types.js';

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

  constructor(name: string = platformName(), host: KeyHost = detectHost()) {
    this.os = KeyHostInfo.osOf(name);
    this.host = host;
  }

  static osOf(name: string): KeyOs {
    if (/mac|iphone|ipad|darwin/i.test(name)) return 'mac';
    if (/win/i.test(name)) return 'win';
    return 'linux';
  }

  get isMac(): boolean {
    return this.os === 'mac';
  }

  get scopes(): KeyScope[] {
    return [this.host, `${this.host}:${this.os}`];
  }

  get scopesExactFirst(): KeyScope[] {
    return [`${this.host}:${this.os}`, this.host];
  }

  get primary(): 'meta' | 'control' | 'alt' {
    return this.isMac ? 'meta' : 'control';
  }

  primaryHeld(event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
    if (this.primary === 'meta') return event.metaKey;
    if (this.primary === 'alt') return event.altKey;
    return event.ctrlKey;
  }

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

export const keyHost = new KeyHostInfo();
