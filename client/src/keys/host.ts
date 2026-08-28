import type { KeyHost, KeyOs, KeyScope } from '@ide/protocol';

export const HOST: KeyHost =
  typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent)
    ? 'electron'
    : 'browser';

function platform(): string {
  if (typeof navigator === 'undefined') return '';
  const modern = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return modern ?? navigator.userAgent ?? '';
}

export const IS_MAC = /Mac|iPhone|iPad/.test(platform());

export const OS: KeyOs = IS_MAC ? 'mac' : /Win/.test(platform()) ? 'win' : 'linux';

export const SCOPES: KeyScope[] = [HOST, `${HOST}:${OS}`];

export const SCOPES_EXACT_FIRST: KeyScope[] = [`${HOST}:${OS}`, HOST];

export const PRIMARY: 'meta' | 'control' | 'alt' = IS_MAC
  ? HOST === 'browser'
    ? 'alt'
    : 'meta'
  : 'control';

export function primaryHeld(event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  if (PRIMARY === 'meta') return event.metaKey;
  if (PRIMARY === 'alt') return event.altKey;
  return event.ctrlKey;
}

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

export function humanizeKey(key: string): string {
  if (key.startsWith('double:')) {
    const name = humanizeKey(key.slice('double:'.length));
    return `${name} ${name}`;
  }
  return key
    .split('+')
    .map((part) => {
      if (part === 'shift') return 'Shift';
      if (part === 'alt') return IS_MAC ? 'Option' : 'Alt';
      if (part === 'control') return 'Control';
      if (part === 'meta') return IS_MAC ? 'Cmd' : 'Win';
      if (NAMES[part]) return NAMES[part];
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join('+');
}
