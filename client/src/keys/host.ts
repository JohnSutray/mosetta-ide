import type { KeyHost, KeyOs, KeyScope } from '@ide/protocol';

export const HOST: KeyHost =
  typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent)
    ? 'electron'
    : 'browser';

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

export const OS: KeyOs = IS_MAC
  ? 'mac'
  : typeof navigator !== 'undefined' && /Win/.test(navigator.platform ?? '')
    ? 'win'
    : 'linux';

export const SCOPES: KeyScope[] = [HOST, `${HOST}:${OS}`];

export const SCOPES_EXACT_FIRST: KeyScope[] = [`${HOST}:${OS}`, HOST];

export const MOD_IS_META = IS_MAC && HOST === 'electron';

export const MOD_LABEL = MOD_IS_META ? 'Cmd' : 'Ctrl';

export const CLIP = IS_MAC && !MOD_IS_META ? 'cmd' : 'mod';

export const CLIP_LABEL = IS_MAC ? 'Cmd' : 'Ctrl';

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
      if (part === 'mod') return MOD_LABEL;
      if (part === 'clip') return CLIP_LABEL;
      if (part === 'shift') return 'Shift';
      if (part === 'alt') return IS_MAC ? 'Option' : 'Alt';
      if (part === 'ctrl' || part === 'control') return 'Control';
      if (part === 'cmd') return 'Cmd';
      if (part === 'meta') return IS_MAC ? 'Cmd' : 'Win';
      if (NAMES[part]) return NAMES[part];
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join('+');
}
