import type { KeyHost } from '@ide/protocol';

export const HOST: KeyHost =
  typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent)
    ? 'electron'
    : 'browser';

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

export const MOD_LABEL = IS_MAC ? 'Cmd' : 'Ctrl';

export function humanizeKey(key: string): string {
  return key
    .split('+')
    .map((part) => {
      if (part === 'mod') return MOD_LABEL;
      if (part === 'shift') return 'Shift';
      if (part === 'alt') return IS_MAC ? 'Option' : 'Alt';
      if (part === 'ctrl') return 'Control';
      if (part === 'backquote') return '`';
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join('+');
}
